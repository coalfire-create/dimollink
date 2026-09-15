import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CameraView } from 'expo-camera';
import {
  SITE_CAPTURE_COPY,
  completedCount,
  createSiteCaptureSession,
  currentSlot,
  isSlotAligned,
  reduceSiteCapture,
} from '@dimol/shared';
import { processCapturedPhoto } from '../../lib/photoQuality';
import { useDeviceOrientation } from '../../lib/useDeviceOrientation';
import type { GuidedCaptureResult } from '../GuidedSiteCaptureModal';

/**
 * 가이드 촬영 진행 상태 — 어느 슬롯 차례인지, 지금 찍어도 되는지, 찍은 사진의 품질.
 *
 * 판정 규칙(슬롯 순서·정렬 여부)은 전부 @dimol/shared 의 순수 함수에 있다.
 * 여기서 맡는 건 **기기 쪽 사정**뿐이다: 센서 값 읽기, 셔터 누름, 촬영 직후 품질 검사.
 *
 * 방향 게이트는 막을 수 없을 때는 막지 않는다 — 센서가 없는 기기나 기준이 되는
 * 첫 촬영에서는 통과시킨다. 안 그러면 그 기기에서는 아예 촬영을 못 한다.
 */
export function useGuidedCapture({
  visible,
  onComplete,
}: {
  visible: boolean;
  onComplete: (photos: GuidedCaptureResult[]) => void;
}) {
  const [session, dispatch] = useReducer(reduceSiteCapture, undefined, createSiteCaptureSession);
  const [capturing, setCapturing] = useState(false);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  const slot = currentSlot(session);
  const orientation = useDeviceOrientation(visible && !session.done);
  const { reading, supported: sensorSupported, permission: sensorPermission } = orientation;

  // 모달을 새로 열 때마다 세션 초기화.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      dispatch({ type: 'RESET' });
      setQualityError(null);
    }
    wasVisible.current = visible;
  }, [visible]);

  /** 방향이 목표 범위에 들어왔는지. 기준 슬롯(첫 촬영)·센서 미수신 시엔 막지 않는다. */
  const aligned = useMemo(() => {
    if (!slot) return false;
    if (!reading) return true; // 센서 데이터 없으면 게이트 우회(촬영 허용)
    if (slot.relativeAzimuth === 0 && session.baseAzimuth === null) return true; // 0도 기준 슬롯
    return isSlotAligned(slot, session.baseAzimuth, reading);
  }, [slot, reading, session.baseAzimuth]);

  /** 방향 게이트가 실제로 작동하는지(센서 지원 + 판정 대상 슬롯). */
  const gateActive =
    sensorSupported &&
    !!reading &&
    !!slot &&
    !(slot.relativeAzimuth === 0 && session.baseAzimuth === null) &&
    !(slot.relativeAzimuth === null && slot.pitchRange === null); // 손상부위 제외

  async function shutter() {
    if (!cameraRef.current || capturing || !slot || !aligned) return;
    setCapturing(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: true });
      if (!shot) return;
      let base64 = shot.base64 ?? '';
      if (!base64 && shot.uri.startsWith('data:')) base64 = shot.uri.split(',')[1] ?? '';
      if (!base64) return;

      // 촬영 즉시 ①품질 검증(암전/렌즈 가림/흐림) ②업로드용 축소 — 디코딩 1회로 함께 처리.
      const uriForCheck = shot.uri.startsWith('data:')
        ? shot.uri
        : `data:image/jpeg;base64,${base64}`;
      const processed = await processCapturedPhoto({
        base64,
        uri: uriForCheck,
        mimeType: 'image/jpeg',
      });
      if (processed.quality.supported && !processed.quality.ok) {
        setQualityError(SITE_CAPTURE_COPY.qualityFail);
        return;
      }

      setQualityError(null);
      dispatch({
        type: 'CAPTURE',
        // 미리보기는 원본 uri, 전송은 축소본 base64(업로드 크기·분석 시간 절감).
        photo: { base64: processed.base64, mimeType: 'image/jpeg', uri: shot.uri },
        atAzimuth: reading?.azimuth ?? null,
      });
    } finally {
      setCapturing(false);
    }
  }

  function finish() {
    onComplete(
      session.photos.map((photo) => ({
        base64: photo.base64,
        mimeType: photo.mimeType,
        uri: photo.uri,
        slotId: photo.slotId,
      })),
    );
  }

  return {
    session,
    slot,
    cameraRef,
    aligned,
    gateActive,
    capturing,
    qualityError,
    reading,
    sensorPermission,
    requestSensorPermission: orientation.requestPermission,
    progress: completedCount(session),
    shotsInCurrentSlot: slot
      ? session.photos.filter((photo) => photo.slotId === slot.id).length
      : 0,
    shutter,
    skip: () => dispatch({ type: 'SKIP' }),
    finishMultiple: () => dispatch({ type: 'FINISH_MULTIPLE' }),
    finish,
  };
}
