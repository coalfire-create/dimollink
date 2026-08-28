import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON,
  BUILDING_TYPE_LABELS,
  DEMOLITION_TYPE_LABELS,
  PILOT,
  wasteItemsToTons,
  type BuildingType,
  type DemolitionDetails,
  type DemolitionType,
  type DimolVisionSummary,
  type GeoPoint,
  type RequestKind,
  type ServiceRequest,
} from '@dimol/shared';
import {
  ApiError,
  analyzeSiteWasteItems,
  createRequest,
  getBuildingInfo,
  type AnalyzeImage,
} from '../api/client';
import { AddressPickerField } from '../components/AddressPickerField';
import { CameraCaptureModal, type CapturedPhoto } from '../components/CameraCaptureModal';
import {
  GuidedSiteCaptureModal,
  type GuidedCaptureResult,
} from '../components/GuidedSiteCaptureModal';
import { AppButton, ErrorBanner, Field, StickyFooter } from '../components/ui';
import {
  WasteItemsInput,
  draftsToWasteItems,
  emptyWasteDraft,
  wasteItemsToDrafts,
  type WasteItemDraft,
} from '../components/WasteItemsInput';
import { FadeInUp } from '../components/motion';
import { ScreenHeader, useNavigation, useSession, type RequestFormPrefill } from '../navigation';
import { theme } from '../theme';

const KIND_TITLES: Record<RequestKind, string> = {
  DEMOLITION: '철거 요청',
  TRANSPORT: '운반 요청',
  DISPOSAL_RESERVATION: '처리장 예약',
};

const BUILDING_TYPES: BuildingType[] = [
  'COMMERCIAL',
  'APARTMENT',
  'HOUSING',
  'OFFICE',
  'FACTORY',
  'OTHER',
];

const DEMOLITION_TYPES: DemolitionType[] = ['TOTAL', 'INTERIOR', 'STRUCTURE'];

type AreaUnit = 'PYEONG' | 'M2';

export function RequestFormScreen({
  kind,
  prefill,
}: {
  kind: RequestKind;
  prefill?: RequestFormPrefill;
}) {
  const nav = useNavigation();
  const user = useSession();

  // 운반/처리장 전용 폐기물 소재별 드래프트
  const [wasteDrafts, setWasteDrafts] = useState<WasteItemDraft[]>(
    prefill?.wasteItems && prefill.wasteItems.length > 0
      ? wasteItemsToDrafts(prefill.wasteItems)
      : [emptyWasteDraft()],
  );

  // 공통 정보
  const [region, setRegion] = useState(prefill?.region ?? user.region ?? '');
  const [location, setLocation] = useState<GeoPoint | undefined>(prefill?.location);
  const [siteAddress, setSiteAddress] = useState('');
  const [loadAddress, setLoadAddress] = useState(prefill?.loadAddress ?? '');
  const [unloadAddress, setUnloadAddress] = useState(prefill?.unloadAddress ?? '');
  const [visitAt, setVisitAt] = useState('');
  const [allbaroRequested, setAllbaroRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reservationDone, setReservationDone] = useState<ServiceRequest | null>(null);

  // 철거 전용 폼 정보
  const [buildingType, setBuildingType] = useState<BuildingType>('COMMERCIAL');
  const [demolitionType, setDemolitionType] = useState<DemolitionType>('INTERIOR');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('PYEONG');
  const [spaceSize, setSpaceSize] = useState(prefill?.spaceSize ?? '');
  const [floorCount, setFloorCount] = useState(
    prefill?.floorCount ? `${prefill.floorCount}층` : '',
  );
  const [hasElevator, setHasElevator] = useState<boolean>(true);
  const [hasVehicleAccess, setHasVehicleAccess] = useState<boolean>(true);
  const [desiredDate, setDesiredDate] = useState('');
  const [description, setDescription] = useState(
    prefill?.wasteTons ? `[물량 계산기 추정치: 약 ${prefill.wasteTons}톤]\n` : '',
  );
  const [buildingStructure, setBuildingStructure] = useState<string | null>(null);

  // 건축물대장 정보 조회
  async function fetchBuildingStructure(address: string) {
    if (!address) return;
    try {
      const info = await getBuildingInfo(address);
      if (info?.strctCdNm) {
        setBuildingStructure(info.strctCdNm);
        // 필요 시 description에 주구조 정보를 추가할 수 있음
        const structureHint = `[건축물대장 주구조: ${info.strctCdNm}]`;
        setDescription((prev) =>
          prev.includes('[건축물대장') ? prev : prev ? `${prev}\n${structureHint}` : structureHint,
        );
      } else {
        setBuildingStructure(null);
      }
    } catch {
      setBuildingStructure(null);
    }
  }

  // 디몰비전 AI 사진 분석 상태
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoSummary, setPhotoSummary] = useState<string | null>(null);
  const [dimolVision, setDimolVision] = useState<DimolVisionSummary | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [guidedOpen, setGuidedOpen] = useState(false);

  // 날짜 선택기 상태
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'desiredDate' | 'visitAt' | null>(null);

  // 가이드 촬영(순서·방향 강제) 완료 → 디몰비전 종합 분석
  function handleGuidedComplete(photos: GuidedCaptureResult[]) {
    setGuidedOpen(false);
    setError(null);
    setPhotoSummary(null);
    void runVision(photos.map((p) => ({ imageBase64: p.base64, mimeType: p.mimeType })));
  }

  // 앨범에서 사진 선택 → 디몰비전 분석
  async function fillFromPhoto() {
    setError(null);
    setPhotoSummary(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    });
    const asset = res.canceled ? undefined : res.assets[0];
    if (!asset?.base64) return;
    void runVision([{ imageBase64: asset.base64, mimeType: asset.mimeType }]);
  }

  // 가이드 카메라로 촬영(여러 장) → 디몰비전 종합 분석
  function handleCameraCapture(photos: CapturedPhoto[]) {
    setCameraOpen(false);
    setError(null);
    setPhotoSummary(null);
    void runVision(photos.map((p) => ({ imageBase64: p.base64, mimeType: p.mimeType })));
  }

  // 공통: 사진(1장 이상)을 디몰비전 AI로 종합 분석하여 폼을 채운다
  async function runVision(images: AnalyzeImage[]) {
    if (images.length === 0) return;
    setPhotoBusy(true);
    try {
      const { analysis, wasteItems } = await analyzeSiteWasteItems({
        images,
        buildingStructure: buildingStructure ?? undefined,
      });

      if (kind === 'DEMOLITION') {
        const summaryObj: DimolVisionSummary = {
          summary: analysis.summary,
          hazards: analysis.hazards,
          materials: analysis.materials.map((m) => m.name),
          confidence: analysis.confidence,
          analyzedAt: analysis.analyzedAt,
        };
        setDimolVision(summaryObj);
        setPhotoSummary(`✨ 디몰비전 AI 분석 완료: ${analysis.summary}`);
      } else {
        if (wasteItems.length === 0) {
          setPhotoSummary('사진에서 소재를 찾지 못했어요. 직접 입력해 주세요.');
          return;
        }
        setWasteDrafts(wasteItemsToDrafts(wasteItems));
        const method = analysis.method === 'AI_VISION' ? 'AI 분석' : '참고(목) 분석';
        setPhotoSummary(
          `${method}으로 소재 ${wasteItems.length}종을 채웠어요. 무게(kg)는 확인·수정해 주세요.`,
        );
      }
    } catch {
      setError('사진 분석에 실패했어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.');
    } finally {
      setPhotoBusy(false);
    }
  }

  const wasteItems = kind === 'DEMOLITION' ? [] : draftsToWasteItems(wasteDrafts);
  const tons = wasteItemsToTons(wasteItems);
  const allbaroMandatory =
    kind !== 'DEMOLITION' && tons >= ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON;

  async function submit() {
    setError(null);
    if (region.trim().length === 0) {
      setError('지역을 입력해 주세요. (예: 서울, 경기 양평)');
      return;
    }
    if (kind === 'DEMOLITION') {
      if (siteAddress.trim().length === 0) {
        setError('현장 주소를 입력해 주세요.');
        return;
      }
    } else {
      if (wasteItems.length === 0) {
        setError('폐기물 소재를 1개 이상 선택하고 예상 무게(kg)를 입력해 주세요.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const demolitionDetails: DemolitionDetails | undefined =
        kind === 'DEMOLITION'
          ? {
              buildingType,
              demolitionType,
              spaceSize: spaceSize.trim() ? `${spaceSize.trim()}${areaUnit === 'PYEONG' ? '평' : '㎡'}` : undefined,
              floorCount: floorCount.trim() || undefined,
              hasElevator,
              hasVehicleAccess,
              desiredDate: desiredDate.trim() || undefined,
              description: description.trim() || undefined,
              dimolVisionAnalysis: dimolVision ?? undefined,
            }
          : undefined;

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
        demolitionDetails,
        loadAddress: kind === 'TRANSPORT' ? loadAddress.trim() : undefined,
        unloadAddress: kind === 'TRANSPORT' ? unloadAddress.trim() : undefined,
        visitAt: kind === 'DISPOSAL_RESERVATION' ? `${visitAt.trim()}T12:00:00+09:00` : undefined,
      });

      if (kind === 'DISPOSAL_RESERVATION') {
        setReservationDone(created);
        setSubmitting(false);
        return;
      }
      nav.pop();
      nav.push({ name: 'requestDetail', requestId: created.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '접수에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  // 연계 스텝: 같은 소재/무게/좌표를 프리필한 운반요청 폼으로 이동(두 요청을 linkedRequestId 로 묶음).
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

  if (reservationDone) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="예약 접수 완료" />
        <ScrollView contentContainerStyle={styles.content}>
          <FadeInUp>
            <View style={styles.doneCard}>
              <Text style={styles.doneEmoji}>✅</Text>
              <Text style={styles.doneTitle}>처리장 예약이 접수됐어요</Text>
              <Text style={styles.doneBody}>
                매칭된 처리장이 「운반요청 별도 필요」이면 폐기물을 처리장까지 옮길 운반이 따로
                필요해요. 지금 같은 소재·무게로 운반요청도 함께 접수할 수 있어요.
              </Text>
            </View>
          </FadeInUp>
        </ScrollView>
        <StickyFooter>
          <AppButton label="운반요청도 함께 하기" onPress={goTransportLink} />
          <Pressable
            onPress={finishReservation}
            accessibilityRole="button"
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>예약만 하고 마치기</Text>
          </Pressable>
        </StickyFooter>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={KIND_TITLES[kind]} canGoBack />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.pilotChip}>
          <Text style={styles.pilotChipText}>전국 · 건설폐기물</Text>
        </View>

        <FadeInUp delay={40}>
          <Field
            label="지역"
            value={region}
            onChangeText={setRegion}
            placeholder="예) 서울, 경기 양평, 부산"
            hint="현장이 위치한 지역이에요."
          />
          {kind === 'DEMOLITION' ? (
            <>
              <AddressPickerField
                label="현장 주소"
                value={siteAddress}
                onChangeAddress={(addr, reg, loc) => {
                  setSiteAddress(addr);
                  if (reg) setRegion(reg);
                  if (loc) setLocation(loc);
                  void fetchBuildingStructure(addr);
                }}
                placeholder="예) ○○시 ○○구 ○○동 12-3"
                hint="카카오 지도 주소 검색으로 정확한 현장 위치를 지정해요."
              />

              {buildingStructure ? (
                <View style={styles.buildingInfoBadge}>
                  <Text style={styles.buildingInfoText}>
                    🏛️ 건축물대장 기준: {buildingStructure}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>건물 / 공간 종류</Text>
              <View style={styles.chipSegment}>
                {BUILDING_TYPES.map((bt) => {
                  const selected = buildingType === bt;
                  return (
                    <Pressable
                      key={bt}
                      accessibilityRole="button"
                      onPress={() => setBuildingType(bt)}
                      style={[styles.chipItem, selected && styles.chipItemActive]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {BUILDING_TYPE_LABELS[bt]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>철거 종류</Text>
              <View style={styles.chipSegment}>
                {DEMOLITION_TYPES.map((dt) => {
                  const selected = demolitionType === dt;
                  return (
                    <Pressable
                      key={dt}
                      accessibilityRole="button"
                      onPress={() => setDemolitionType(dt)}
                      style={[styles.chipItem, selected && styles.chipItemActive]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {DEMOLITION_TYPE_LABELS[dt]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>건물 면적</Text>
              <View style={styles.unitToggle}>
                {(
                  [
                    ['PYEONG', '평'],
                    ['M2', '㎡'],
                  ] as Array<[AreaUnit, string]>
                ).map(([value, label]) => {
                  const active = areaUnit === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => setAreaUnit(value)}
                      style={[styles.unitOption, active && styles.unitOptionActive]}
                    >
                      <Text style={[styles.unitOptionText, active && styles.unitOptionTextActive]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label={areaUnit === 'PYEONG' ? '한 층 바닥면적 (평)' : '한 층 바닥면적 (㎡)'}
                value={spaceSize}
                onChangeText={setSpaceSize}
                placeholder={areaUnit === 'PYEONG' ? '예) 30' : '예) 99'}
                keyboardType="numeric"
              />

              <Field
                label="현장 층수"
                value={floorCount}
                onChangeText={setFloorCount}
                placeholder="예) 지상 3층 / 지하 1층"
              />

              <Text style={styles.sectionLabel}>현장 진입 조건</Text>
              <View style={styles.conditionRow}>
                <Text style={styles.conditionLabel}>엘리베이터</Text>
                <View style={styles.yesNoSegment}>
                  <Pressable
                    style={[styles.yesNoBtn, hasElevator && styles.yesNoBtnActive]}
                    onPress={() => setHasElevator(true)}
                  >
                    <Text style={[styles.yesNoText, hasElevator && styles.yesNoTextActive]}>
                      있음
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.yesNoBtn, !hasElevator && styles.yesNoBtnActive]}
                    onPress={() => setHasElevator(false)}
                  >
                    <Text style={[styles.yesNoText, !hasElevator && styles.yesNoTextActive]}>
                      없음
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.conditionRow}>
                <Text style={styles.conditionLabel}>차량/사다리차 진입</Text>
                <View style={styles.yesNoSegment}>
                  <Pressable
                    style={[styles.yesNoBtn, hasVehicleAccess && styles.yesNoBtnActive]}
                    onPress={() => setHasVehicleAccess(true)}
                  >
                    <Text style={[styles.yesNoText, hasVehicleAccess && styles.yesNoTextActive]}>
                      가능
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.yesNoBtn, !hasVehicleAccess && styles.yesNoBtnActive]}
                    onPress={() => setHasVehicleAccess(false)}
                  >
                    <Text style={[styles.yesNoText, !hasVehicleAccess && styles.yesNoTextActive]}>
                      불가
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={() => {
                  setDatePickerTarget('desiredDate');
                  setShowDatePicker(true);
                }}
              >
                <View pointerEvents="none">
                  <Field
                    label="희망 철거 날짜"
                    value={desiredDate}
                    onChangeText={setDesiredDate}
                    placeholder="터치하여 날짜 선택"
                    editable={false}
                  />
                </View>
              </Pressable>

              {/* ✨ 디몰비전 AI 사진 분석 */}
              <Text style={styles.sectionLabel}>✨ 디몰비전 AI 현장 분석</Text>
              <Pressable
                accessibilityRole="button"
                style={styles.photoFillBtn}
                onPress={() => setGuidedOpen(true)}
                disabled={photoBusy}
              >
                <Text style={styles.photoFillText}>
                  {photoBusy ? '디몰비전 AI 분석 중…' : '🧭 가이드 촬영 (현장 전체 빠짐없이)'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.photoAltBtn}
                onPress={() => setCameraOpen(true)}
                disabled={photoBusy}
              >
                <Text style={styles.photoAltText}>자유 촬영</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.photoAltBtn}
                onPress={fillFromPhoto}
                disabled={photoBusy}
              >
                <Text style={styles.photoAltText}>또는 앨범에서 선택</Text>
              </Pressable>

              {photoSummary ? <Text style={styles.photoSummary}>{photoSummary}</Text> : null}

              {dimolVision ? (
                <View style={styles.visionCard}>
                  <View style={styles.visionCardHeader}>
                    <Text style={styles.visionCardBadge}>디몰비전 AI분석</Text>
                    <Text style={styles.visionConfidence}>
                      신뢰도: {dimolVision.confidence ?? 'NORMAL'}
                    </Text>
                  </View>
                  <Text style={styles.visionSummaryText}>"{dimolVision.summary}"</Text>
                  {dimolVision.hazards && dimolVision.hazards.length > 0 ? (
                    <View style={styles.visionHazardBox}>
                      <Text style={styles.visionHazardTitle}>⚠️ 주의 필요 위험 요인:</Text>
                      {dimolVision.hazards.map((h, i) => (
                        <Text key={i} style={styles.visionHazardItem}>
                          • {h}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {dimolVision.materials && dimolVision.materials.length > 0 ? (
                    <View style={styles.visionMaterialBox}>
                      <Text style={styles.visionMaterialTitle}>🔍 감지된 주요 구조 소재:</Text>
                      <Text style={styles.visionMaterialText}>
                        {dimolVision.materials.join(', ')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Field
                label="상세 요구사항"
                value={description}
                onChangeText={setDescription}
                placeholder="예) 주방·욕실 포함 전체 철거, 바닥 샌딩 포함, 야간 작업 가능 여부"
                multiline
                style={styles.multilineInput}
              />
            </>
          ) : null}

          {kind === 'TRANSPORT' ? (
            <>
              <AddressPickerField
                label="상차지 주소 (폐기물을 싣는 곳)"
                value={loadAddress}
                onChangeAddress={(addr, reg, loc) => {
                  setLoadAddress(addr);
                  if (reg) setRegion(reg);
                  if (loc) setLocation(loc);
                }}
                placeholder="예) ○○시 ○○구 ○○동 12-3"
              />
              <AddressPickerField
                label="하차지 주소 (폐기물을 내리는 곳)"
                value={unloadAddress}
                onChangeAddress={(addr) => setUnloadAddress(addr)}
                placeholder="예) ○○시 ○○구 처리장"
              />
            </>
          ) : null}
          {kind === 'DISPOSAL_RESERVATION' ? (
            <>
              <Pressable
                onPress={() => {
                  setDatePickerTarget('visitAt');
                  setShowDatePicker(true);
                }}
              >
                <View pointerEvents="none">
                  <Field
                    label="방문 희망 날짜"
                    value={visitAt}
                    onChangeText={setVisitAt}
                    placeholder="터치하여 날짜 선택"
                    hint="날짜만 선택해 주세요. 시간은 처리장과 협의해요."
                    editable={false}
                  />
                </View>
              </Pressable>
              <View style={styles.transportInfo}>
                <Text style={styles.transportInfoText}>
                  🚚 처리장마다 운반요청 가능 여부가 달라요. 예약 후 매칭된 처리장이 「운반요청 별도
                  필요」면 운반요청을 함께 하도록 안내해 드려요.
                </Text>
              </View>
            </>
          ) : null}

          {kind === 'TRANSPORT' ? (
            <>
              <Pressable
                accessibilityRole="button"
                style={styles.photoFillBtn}
                onPress={() => setCameraOpen(true)}
                disabled={photoBusy}
              >
                <Text style={styles.photoFillText}>
                  {photoBusy ? '사진 분석 중…' : '📷 사진 촬영으로 소재·무게 자동 채우기'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.photoAltBtn}
                onPress={fillFromPhoto}
                disabled={photoBusy}
              >
                <Text style={styles.photoAltText}>또는 앨범에서 선택</Text>
              </Pressable>
              {photoSummary ? <Text style={styles.photoSummary}>{photoSummary}</Text> : null}
            </>
          ) : null}

          {kind !== 'DEMOLITION' ? (
            <WasteItemsInput items={wasteDrafts} onChange={setWasteDrafts} />
          ) : null}
        </FadeInUp>

        {allbaroMandatory ? (
          <FadeInUp>
            <View style={styles.mandatoryNotice}>
              <Text style={styles.mandatoryTitle}>♻️ 올바로 신고 대상</Text>
              <Text style={styles.mandatoryBody}>
                {ALLBARO_MANDATORY_CONSTRUCTION_WASTE_TON}톤 이상은 전자인계서 의무 대상이에요. 켜
                두면 자동으로 처리해 드려요.
              </Text>
            </View>
          </FadeInUp>
        ) : null}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allbaroRequested }}
          onPress={() => setAllbaroRequested((v) => !v)}
          style={[styles.checkboxRow, allbaroRequested && styles.checkboxRowChecked]}
        >
          <Text style={styles.checkboxMark}>{allbaroRequested ? '☑' : '☐'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkboxLabel}>올바로 전자인계서 신고</Text>
            <Text style={styles.checkboxHint}>
              {allbaroRequested ? '자동 발행해 드려요' : '자체 간이 확인서로 대체'}
            </Text>
          </View>
        </Pressable>

        <ErrorBanner message={error} />
      </ScrollView>
      <StickyFooter>
        <AppButton label="접수하기" onPress={submit} loading={submitting} />
      </StickyFooter>

      <CameraCaptureModal
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

      <GuidedSiteCaptureModal
        visible={guidedOpen}
        onClose={() => setGuidedOpen(false)}
        onComplete={handleGuidedComplete}
      />

      {showDatePicker && (
        <DateTimePicker
          value={
            datePickerTarget === 'desiredDate' && desiredDate
              ? new Date(desiredDate)
              : datePickerTarget === 'visitAt' && visitAt
                ? new Date(visitAt)
                : new Date()
          }
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (event.type === 'set' && selectedDate) {
              const dateString = selectedDate.toISOString().split('T')[0];
              if (datePickerTarget === 'desiredDate') {
                setDesiredDate(dateString);
              } else if (datePickerTarget === 'visitAt') {
                setVisitAt(dateString);
              }
            }
          }}
        />
      )}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  pilotChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pilotChipText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  buildingInfoBadge: {
    backgroundColor: '#E8F0FE',
    borderRadius: radius.card,
    padding: spacing.sm,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  buildingInfoText: {
    color: '#1967D2',
    fontSize: font.caption,
    fontWeight: '700',
  },
  doneCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
  },
  doneEmoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  doneTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  doneBody: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: font.body + 8,
    textAlign: 'center',
  },
  secondaryBtn: {
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  secondaryBtnText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
  },
  photoFillBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.xs,
  },
  photoFillText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '800',
  },
  photoAltBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    marginBottom: spacing.xs,
  },
  photoAltText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  photoSummary: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.sm,
  },
  transportInfo: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  transportInfoText: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: font.caption + 6,
  },
  mandatoryNotice: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
    borderLeftWidth: 4,
    borderRadius: radius.card,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  mandatoryTitle: {
    color: '#1E5FBF',
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  mandatoryBody: {
    color: '#1E5FBF',
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  checkboxRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: 'transparent',
    borderRadius: radius.card,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  checkboxRowChecked: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.primary,
    fontSize: font.titleLarge,
    marginRight: spacing.sm,
  },
  checkboxLabel: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  checkboxHint: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  chipSegment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  chipItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  chipItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitToggle: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: 4,
  },
  unitOption: {
    alignItems: 'center',
    borderRadius: radius.button - 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight - 8,
  },
  unitOptionActive: {
    backgroundColor: colors.background,
    ...theme.shadow.card,
  },
  unitOptionText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  unitOptionTextActive: {
    color: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  conditionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  conditionLabel: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '600',
  },
  yesNoSegment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  yesNoBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  yesNoBtnActive: {
    backgroundColor: colors.primary,
  },
  yesNoText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  yesNoTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  visionCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  visionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  visionCardBadge: {
    backgroundColor: colors.primary,
    color: '#FFFFFF',
    fontSize: font.caption,
    fontWeight: '800',
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: 4,
  },
  visionConfidence: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  visionSummaryText: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginVertical: spacing.xs,
  },
  visionHazardBox: {
    backgroundColor: '#FFF4F4',
    borderRadius: radius.button,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  visionHazardTitle: {
    color: colors.error,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: 2,
  },
  visionHazardItem: {
    color: colors.error,
    fontSize: font.caption,
  },
  visionMaterialBox: {
    marginTop: spacing.xs,
  },
  visionMaterialTitle: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
  },
  visionMaterialText: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  multilineInput: {
    minHeight: 80,
  },
});
