import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SITE_CAPTURE_TOTAL } from '@dimol/shared';
import type { CapturedPhoto } from './CameraCaptureModal';
import { CameraPermissionGate, CaptureCompleteView } from './capture/CaptureGates';
import { CaptureControls } from './capture/CaptureControls';
import { CaptureFrame } from './capture/CaptureFrame';
import { CaptureTopBar } from './capture/CaptureTopBar';
import { turnHint } from './capture/turnHint';
import { useGuidedCapture } from './capture/useGuidedCapture';
import { theme } from '../theme';

export interface GuidedCaptureResult extends CapturedPhoto {
  /** 어떤 슬롯에서 찍혔는지(정면벽/우측벽/…/손상부위). */
  slotId: string;
}

/**
 * 철거 현장 가이드 촬영 — 정해진 순서·방향으로만 진행되는 촬영 플로우.
 *
 * 자유롭게 찍게 두지 않는 이유: 같은 벽만 여러 장 찍히고 반대쪽이 빠진 묶음으로는
 * 물량을 산출할 수 없다. 순서와 방향을 강제하면 어느 현장이든 같은 구성의 사진이 남는다.
 *
 * 이 파일은 전체 배치만 맡는다 — 진행 상태는 [[useGuidedCapture]], 각 영역은
 * `components/capture/` 에 있다.
 */
export function GuidedSiteCaptureModal({
  visible,
  onClose,
  onComplete,
}: {
  visible: boolean;
  onClose: () => void;
  /** 전체 슬롯 완료 시 촬영된 사진들을 넘긴다(견적 분석 API 로 전달). */
  onComplete: (photos: GuidedCaptureResult[]) => void;
}) {
  const [permission, requestCameraPermission] = useCameraPermissions();
  const capture = useGuidedCapture({ visible, onComplete });
  const { session, slot } = capture;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {!permission ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={theme.colors.background} />
          </View>
        ) : !permission.granted ? (
          <CameraPermissionGate onAllow={requestCameraPermission} onClose={onClose} />
        ) : session.done ? (
          <CaptureCompleteView count={session.photos.length} onNext={capture.finish} />
        ) : (
          <>
            <CameraView ref={capture.cameraRef} style={StyleSheet.absoluteFill} facing="back" />

            <View style={styles.overlay} pointerEvents="box-none">
              <CaptureTopBar
                progress={capture.progress}
                total={SITE_CAPTURE_TOTAL}
                instruction={slot?.instruction}
                sensorPermission={capture.sensorPermission}
                onRequestSensor={capture.requestSensorPermission}
                onClose={onClose}
              />

              <CaptureFrame aligned={capture.aligned} />

              <CaptureControls
                slot={slot}
                aligned={capture.aligned}
                gateActive={capture.gateActive}
                capturing={capture.capturing}
                qualityError={capture.qualityError}
                hint={slot ? turnHint(slot, session, capture.reading) : ''}
                shotsInSlot={capture.shotsInCurrentSlot}
                onShutter={() => void capture.shutter()}
                onSkip={capture.skip}
                onFinishMultiple={capture.finishMultiple}
              />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    // 카메라 화면은 화면 전체가 어둡다 — 상태 토큰의 카메라 배경색을 쓴다.
    backgroundColor: theme.colors.cameraBackground,
    flex: 1,
  },
  centerFill: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
});
