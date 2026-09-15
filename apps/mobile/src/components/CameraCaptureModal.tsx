import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { CameraPermissionGate } from './capture/CaptureGates';
import { FreeCaptureControls } from './capture/FreeCaptureControls';
import { FreeCaptureFrame } from './capture/FreeCaptureFrame';
import { ShotGuidePanel } from './capture/ShotGuidePanel';
import { useFreeCapture } from './capture/useFreeCapture';
import { theme } from '../theme';

export interface CapturedPhoto {
  base64: string;
  mimeType: string;
  uri: string;
  /**
   * 품질 미달 사유(흐림·암전·과노출). 촬영을 막지는 않지만 서버로 함께 보내
   * 그 사진에서 나온 판정의 신뢰도를 낮추는 데 쓴다.
   */
  qualityWarnings?: string[];
}

/**
 * 현장 자유 촬영 카메라 — 뷰파인더 위에 프레이밍 가이드와 촬영 팁을 얹는다.
 *
 * 가이드 촬영(GuidedSiteCaptureModal)과 달리 순서·방향을 강제하지 않는다.
 * 이미 현장을 아는 사용자나 특정 부위만 다시 찍는 경우를 위한 경로다.
 *
 * 촬영 상태는 [[useFreeCapture]], 각 영역은 `components/capture/` 에 있다.
 */
export function CameraCaptureModal({
  visible,
  onClose,
  onCapture,
  maxPhotos = 6,
}: {
  visible: boolean;
  onClose: () => void;
  /** 촬영 완료 시 찍은 사진들(1장 이상)을 넘긴다. 여러 장이면 종합 분석한다. */
  onCapture: (photos: CapturedPhoto[]) => void;
  /** 최대 촬영 장수(기본 6 — 서버 MAX_ANALYZE_IMAGES 와 일치). */
  maxPhotos?: number;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const capture = useFreeCapture({ maxPhotos, onCapture, onClose });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={capture.close}>
      <View style={styles.screen}>
        {!permission ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color={theme.colors.background} />
          </View>
        ) : !permission.granted ? (
          <CameraPermissionGate onAllow={requestPermission} onClose={capture.close} />
        ) : (
          <>
            <CameraView
              ref={capture.cameraRef}
              style={StyleSheet.absoluteFill}
              facing={capture.facing}
            />

            {/* 가이드 오버레이 (터치 통과) */}
            <View style={styles.overlay} pointerEvents="box-none">
              <ShotGuidePanel shotCount={capture.photos.length} onClose={capture.close} />
              <FreeCaptureFrame />
              <FreeCaptureControls
                photos={capture.photos}
                capturing={capture.capturing}
                reachedMax={capture.reachedMax}
                maxPhotos={maxPhotos}
                onRemove={capture.remove}
                onFlip={capture.flip}
                onShutter={() => void capture.shutter()}
                onDone={capture.done}
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
