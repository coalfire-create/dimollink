import { useEffect, useRef, useState } from 'react';
import {
  ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON,
  PILOT,
  PYEONG_TO_M2,
  buildingTypeOf,
  elevatorCount,
  floorLabel,
  hasLedgerData,
  isCompanyType,
  parseFloorCount,
  perFloorAreaM2,
  wasteItemsToTons,
  type BuildingLedgerInfo,
  type BuildingType,
  type DemolitionDetails,
  type DemolitionType,
  type GeoPoint,
  type RequestKind,
  type ServiceRequest,
} from '@dimol/shared';
import { ApiError, createRequest } from '../../api/client';
import { useToast } from '../../components/Toast';
import {
  draftsToWasteItems,
  emptyWasteDraft,
  wasteItemsToDrafts,
  type WasteItemDraft,
} from '../../components/WasteItemsInput';
import { invalidateQueries } from '../../lib/query';
import type { RequestDraftValues } from '../../lib/request-draft';
import {
  errorSummary,
  hasErrors,
  validateRequestForm,
  type RequestFormErrors,
} from '../../lib/request-form-validation';
import {
  useLeaveGuard,
  useNavigation,
  useSession,
  type RequestFormPrefill,
} from '../../navigation';
import { useBuildingLedger } from '../../lib/useBuildingLedger';
import { useFormDraft } from './useFormDraft';
import { useVisionAnalysis } from './useVisionAnalysis';

/**
 * 요청 폼의 상태와 규칙 — 화면(JSX)에서 떼어낸 한 덩어리.
 *
 * 이 폼은 입력 칸 스무 개에 건축물대장 조회·사진 분석·초안 저장·이탈 가드까지 얹혀 있다.
 * 상태와 JSX 가 한 파일에 있던 시절에는 어느 쪽을 고치든 다른 쪽을 스크롤해 지나가야 했다(1700줄).
 *
 * 지금 이 파일이 맡는 건 **폼 자체의 값과 접수**뿐이다. 곁다리로 붙는 세 가지는 각자
 * 자기 훅에 있다: [[useBuildingLedger]](공공데이터 조회), [[useVisionAnalysis]](사진 분석),
 * [[useFormDraft]](임시 저장 타이밍).
 *
 * 반환값이 넓은 건 폼이 실제로 넓은 탓이다. 대신 섹션 컴포넌트는 이 객체 하나만 받으므로
 * 입력이 늘어도 컴포넌트 시그니처가 흔들리지 않는다.
 */

export type AreaUnit = 'PYEONG' | 'M2';
export type { LedgerState } from '../../lib/useBuildingLedger';

/** react-native-calendars 의 markedDates 값 — 다중 선택 표시에 쓰는 필드만 둔다. */
export interface MarkedDate {
  selected: boolean;
  selectedColor: string;
}

export function useRequestForm(kind: RequestKind, prefill?: RequestFormPrefill) {
  const nav = useNavigation();
  const user = useSession();
  const toast = useToast();

  /** 필드별 검증 오류 — 각 입력 아래에 붙는다(어느 칸이 문제인지 찾게 하지 않는다). */
  const [fieldErrors, setFieldErrors] = useState<RequestFormErrors>({});
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reservationDone, setReservationDone] = useState<ServiceRequest | null>(null);
  /** 접수에 성공했으면 초안도 이탈 경고도 필요 없다. */
  const submittedRef = useRef(false);

  // ── 입력값 ────────────────────────────────────────────────────────────────
  const [wasteDrafts, setWasteDrafts] = useState<WasteItemDraft[]>(
    prefill?.wasteItems && prefill.wasteItems.length > 0
      ? wasteItemsToDrafts(prefill.wasteItems)
      : [emptyWasteDraft()],
  );
  const [region, setRegion] = useState(prefill?.region ?? user.region ?? '');
  const [location, setLocation] = useState<GeoPoint | undefined>(prefill?.location);
  const [siteAddress, setSiteAddress] = useState(prefill?.siteAddress ?? '');
  const [loadAddress, setLoadAddress] = useState(prefill?.loadAddress ?? '');
  const [unloadAddress, setUnloadAddress] = useState(prefill?.unloadAddress ?? '');
  const [visitAt, setVisitAt] = useState('');
  const [allbaroRequested, setAllbaroRequested] = useState(false);

  // 철거 전용
  const [buildingType, setBuildingType] = useState<BuildingType>('COMMERCIAL');
  const [demolitionType, setDemolitionType] = useState<DemolitionType>('INTERIOR');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('PYEONG');
  const [spaceSize, setSpaceSize] = useState(prefill?.spaceSize ?? '');
  const [floorCount, setFloorCount] = useState(
    prefill?.floorCount ? `${prefill.floorCount}층` : '',
  );
  const [hasElevator, setHasElevator] = useState(true);
  const [hasVehicleAccess, setHasVehicleAccess] = useState(true);
  const [desiredDate, setDesiredDate] = useState('');
  const [selectedDates, setSelectedDates] = useState<Record<string, MarkedDate>>({});
  const [description, setDescription] = useState(
    prefill?.wasteTons ? `[물량 계산기 추정치: 약 ${prefill.wasteTons}톤]\n` : '',
  );

  // 달력에서 고른 날짜들이 곧 희망 일정 문자열이다(서버에는 한 줄로 저장된다).
  useEffect(() => {
    setDesiredDate(Object.keys(selectedDates).sort().join(', '));
  }, [selectedDates]);

  // 날짜 선택기(처리장 방문일)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'desiredDate' | 'visitAt' | null>(null);

  /** 사용자가 그 칸을 고치기 시작하면 그 칸의 오류 문구는 즉시 치운다. */
  function clearFieldError(field: keyof RequestFormErrors) {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  // ── 건축물대장 ────────────────────────────────────────────────────────────
  /** 대장 정보로 폼을 미리 채운다. 사용자가 이미 입력한 값은 건드리지 않는다. */
  function applyLedgerToForm(info: BuildingLedgerInfo) {
    const type = buildingTypeOf(info);
    if (type) setBuildingType(type);

    const floors = floorLabel(info);
    if (floors) setFloorCount((prev) => (prev.trim() ? prev : floors));

    // 승강기 유무는 대장에 대수로 적혀 있다 — 사용자가 고르기 전에 사실로 맞춰둔다.
    const elevators = elevatorCount(info);
    if (elevators !== undefined) setHasElevator(elevators > 0);

    // 폼의 면적 칸은 '한 층 바닥면적'이므로 연면적을 층수로 나눠 채운다.
    const perFloor = perFloorAreaM2(info);
    if (perFloor) {
      setSpaceSize((prev) => {
        if (prev.trim()) return prev;
        return areaUnit === 'PYEONG'
          ? `${Math.round(perFloor / PYEONG_TO_M2)}`
          : `${Math.round(perFloor)}`;
      });
    }
  }

  const ledger = useBuildingLedger({
    prefilledAddress: prefill?.siteAddress,
    onApply: applyLedgerToForm,
  });

  // ── 사진 분석 ─────────────────────────────────────────────────────────────
  /**
   * 폼 입력(한 층 바닥면적 × 층수)을 연면적 ㎡ 로 환산한다. 물량 추정은 연면적 기준이라
   * 층수를 곱해야 맞다. 층수를 못 읽으면 1층으로 본다.
   */
  function formTotalAreaM2(): number | undefined {
    const n = Number(spaceSize.trim());
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const perFloor = areaUnit === 'PYEONG' ? n * PYEONG_TO_M2 : n;
    const floors = parseFloorCount(floorCount) ?? 1;
    return Math.round(perFloor * floors * 10) / 10;
  }

  const vision = useVisionAnalysis({
    kind,
    building: ledger.building,
    siteAddress,
    getFormAreaM2: formTotalAreaM2,
    onWasteItems: (items) => setWasteDrafts(wasteItemsToDrafts(items)),
    onError: setError,
  });

  /** 디몰비전은 현장 주소가 확정된 뒤에만 촬영할 수 있다(건물 정보 없는 분석 방지). */
  const addressReady = siteAddress.trim().length > 0;
  const visionLocked = kind === 'DEMOLITION' && !addressReady;
  const visionDisabled = vision.busy || visionLocked || ledger.state === 'loading';

  function guardVision(open: () => void) {
    if (visionLocked) {
      setError(
        '먼저 현장 주소를 지정해 주세요. 주소를 알아야 건축물대장 정보를 확인하고 정확히 분석할 수 있어요.',
      );
      return;
    }
    setError(null);
    vision.setSummary(null);
    open();
  }

  // ── 파생값 ────────────────────────────────────────────────────────────────
  const wasteItems = kind === 'DEMOLITION' ? [] : draftsToWasteItems(wasteDrafts);
  const tons = wasteItemsToTons(wasteItems);
  const allbaroMandatory =
    kind !== 'DEMOLITION' && tons >= ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON;
  const canRequestAllbaro = isCompanyType(user.userType);

  // ── 초안(임시 저장) ───────────────────────────────────────────────────────
  const draftValues: RequestDraftValues = {
    region,
    siteAddress,
    spaceSize,
    floorCount,
    desiredDate,
    description,
    loadAddress,
    unloadAddress,
    visitAt,
  };

  const draft = useFormDraft({
    kind,
    values: draftValues,
    enabled: !submittedRef.current,
    /**
     * 링크(디몰비전)로 넘어온 프리필이 있으면 그쪽이 우선한다. 프리필은 방금 본 현장의
     * 최신 정보고, 초안은 과거에 쓰다 만 값이라 덮어쓰면 틀린 정보가 들어간다.
     */
    onRestore: (saved) => {
      let restored = false;
      const apply = (value: string, current: string, set: (v: string) => void) => {
        if (value.trim() && !current.trim()) {
          set(value);
          restored = true;
        }
      };
      apply(saved.region, prefill?.region ?? user.region ?? '', setRegion);
      apply(saved.siteAddress, prefill?.siteAddress ?? '', setSiteAddress);
      apply(saved.spaceSize, prefill?.spaceSize ?? '', setSpaceSize);
      apply(saved.floorCount, prefill?.floorCount ?? '', setFloorCount);
      apply(saved.desiredDate, '', setDesiredDate);
      apply(saved.description, '', setDescription);
      apply(saved.loadAddress, prefill?.loadAddress ?? '', setLoadAddress);
      apply(saved.unloadAddress, prefill?.unloadAddress ?? '', setUnloadAddress);
      apply(saved.visitAt, '', setVisitAt);
      if (restored) toast.info('이어서 작성할 수 있어요.', '지난번에 쓰던 내용을 불러왔어요.');
    },
  });

  // ── 이탈 가드 ─────────────────────────────────────────────────────────────
  /** 쓰다 만 내용이 있는지 — 이탈 경고를 띄울지 판단한다. */
  const isDirty =
    !submittedRef.current &&
    (Object.values(draftValues).some((v) => v.trim().length > 0) ||
      wasteDrafts.some((d) => d.kg.trim().length > 0));

  /**
   * 가려던 목적지를 들고 있다가 "나가기"를 고르면 그대로 보낸다.
   * (뒤로가기·브레드크럼·탭 전환 중 무엇을 눌렀든 그곳으로 간다.)
   */
  const pendingLeaveRef = useRef<(() => void) | null>(null);

  useLeaveGuard(isDirty, (proceed) => {
    pendingLeaveRef.current = proceed;
    setLeaveConfirmOpen(true);
    return true; // 이동을 멈추고 확인을 받는다.
  });

  /** 확인 모달에서 "나가기" — 가드를 풀고 원래 가려던 곳으로 간다(초안은 남겨 둔다). */
  function leaveWithoutSaving() {
    setLeaveConfirmOpen(false);
    nav.setLeaveGuard(null);
    const proceed = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    if (proceed) proceed();
    else nav.pop();
  }

  // ── 접수 ──────────────────────────────────────────────────────────────────
  function demolitionDetails(): DemolitionDetails | undefined {
    if (kind !== 'DEMOLITION') return undefined;
    return {
      buildingType,
      demolitionType,
      spaceSize: spaceSize.trim()
        ? `${spaceSize.trim()}${areaUnit === 'PYEONG' ? '평' : '㎡'}`
        : undefined,
      floorCount: floorCount.trim() || undefined,
      hasElevator,
      hasVehicleAccess,
      desiredDate: desiredDate.trim() || undefined,
      description: description.trim() || undefined,
      dimolVisionAnalysis: vision.vision ?? undefined,
      // 촬영 전에 확인한 공공데이터 사실을 요청과 함께 남긴다(업체가 현장 전에 확인).
      buildingLedger:
        ledger.building && hasLedgerData(ledger.building) ? ledger.building : undefined,
    };
  }

  async function submit() {
    setError(null);
    // 모든 필드를 한 번에 검사한다 — 고치고 누르기를 반복하지 않도록.
    const errors = validateRequestForm({
      kind,
      region,
      siteAddress,
      spaceSize,
      floorCount,
      wasteItems,
      loadAddress,
      unloadAddress,
      visitAt,
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setError(errorSummary(errors));
      toast.error('입력을 확인해 주세요.', '빨간 표시가 있는 칸을 채우면 접수할 수 있어요.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createRequest({
        kind,
        requesterId: user.id,
        region: region.trim(),
        wasteCategory: PILOT.wasteCategory,
        wasteItems,
        wasteTons: prefill?.wasteTons, // 전달된 wasteTons 가 있다면 서버에 전달
        allbaroRequested,
        location: location ?? prefill?.location,
        linkedRequestId: prefill?.linkedRequestId,
        siteAddress: kind === 'DEMOLITION' ? siteAddress.trim() : undefined,
        demolitionDetails: demolitionDetails(),
        loadAddress: kind === 'TRANSPORT' ? loadAddress.trim() : undefined,
        unloadAddress: kind === 'TRANSPORT' ? unloadAddress.trim() : undefined,
        visitAt: kind === 'DISPOSAL_RESERVATION' ? `${visitAt.trim()}T12:00:00+09:00` : undefined,
      });

      // 접수됐으니 초안과 이탈 경고를 함께 정리한다.
      submittedRef.current = true;
      nav.setLeaveGuard(null);
      draft.discard();
      // 목록 캐시를 낡은 것으로 표시 — 대시보드로 돌아가면 새 요청이 보인다.
      invalidateQueries('requests:list');

      if (kind === 'DISPOSAL_RESERVATION') {
        setReservationDone(created);
        setSubmitting(false);
        toast.success('예약이 접수됐어요.');
        return;
      }
      nav.pop();
      nav.push({ name: 'requestDetail', requestId: created.id });
      toast.success('요청이 성공적으로 접수됐어요.', '업체 견적이 도착하면 알림으로 알려드릴게요.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '접수에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  /** 연계 스텝: 같은 소재·무게·좌표를 프리필한 운반요청 폼으로 (두 요청을 linkedRequestId 로 묶는다). */
  function goTransportLink() {
    const done = reservationDone;
    if (!done) return;
    nav.pop();
    nav.push({
      name: 'requestForm',
      kind: 'TRANSPORT',
      prefill: {
        wasteItems,
        region: done.region,
        location: done.location,
        linkedRequestId: done.id,
      },
    });
  }

  function finishReservation() {
    const done = reservationDone;
    if (!done) return;
    nav.pop();
    nav.push({ name: 'requestDetail', requestId: done.id });
  }

  return {
    kind,

    // 값
    region,
    siteAddress,
    loadAddress,
    unloadAddress,
    visitAt,
    setVisitAt,
    buildingType,
    setBuildingType,
    demolitionType,
    setDemolitionType,
    areaUnit,
    setAreaUnit,
    spaceSize,
    setSpaceSize,
    floorCount,
    setFloorCount,
    hasElevator,
    setHasElevator,
    hasVehicleAccess,
    setHasVehicleAccess,
    selectedDates,
    setSelectedDates,
    description,
    setDescription,
    wasteDrafts,
    setWasteDrafts,
    allbaroRequested,
    setAllbaroRequested,

    /** 주소 선택기는 주소·지역·좌표를 한꺼번에 돌려준다 — 세 값이 늘 같이 바뀐다. */
    setSiteAddressPicked: (addr: string, reg?: string, loc?: GeoPoint) => {
      setSiteAddress(addr);
      if (reg) setRegion(reg);
      if (loc) setLocation(loc);
      clearFieldError('siteAddress');
      clearFieldError('region');
      void ledger.fetchLedger(addr);
    },
    setLoadAddressPicked: (addr: string, reg?: string, loc?: GeoPoint) => {
      setLoadAddress(addr);
      if (reg) setRegion(reg);
      if (loc) setLocation(loc);
      clearFieldError('loadAddress');
      clearFieldError('region');
    },
    setUnloadAddressPicked: (addr: string) => {
      setUnloadAddress(addr);
      clearFieldError('unloadAddress');
    },

    // 검증·오류
    fieldErrors,
    clearFieldError,
    error,

    // 파생값
    tons,
    allbaroMandatory,
    canRequestAllbaro,
    addressReady,
    visionLocked,
    visionDisabled,

    // 건축물대장
    building: ledger.building,
    ledgerState: ledger.state,

    // 디몰비전
    photoBusy: vision.busy,
    photoSummary: vision.summary,
    dimolVision: vision.vision,
    cameraOpen: vision.cameraOpen,
    setCameraOpen: vision.setCameraOpen,
    guidedOpen: vision.guidedOpen,
    setGuidedOpen: vision.setGuidedOpen,
    guardVision,
    fillFromPhoto: vision.fillFromPhoto,
    handleCameraCapture: vision.handleCameraCapture,
    handleGuidedComplete: vision.handleGuidedComplete,

    // 날짜 선택기
    showDatePicker,
    setShowDatePicker,
    datePickerTarget,
    setDatePickerTarget,

    // 이탈 가드
    leaveConfirmOpen,
    setLeaveConfirmOpen,
    leaveWithoutSaving,

    // 접수
    submitting,
    submit,
    reservationDone,
    goTransportLink,
    finishReservation,
  };
}

/** 섹션 컴포넌트들이 받는 폼 상태 — 훅 반환값 그대로. */
export type RequestFormState = ReturnType<typeof useRequestForm>;
