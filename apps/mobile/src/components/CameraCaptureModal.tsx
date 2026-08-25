import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { AppIcon } from './AppIcon';
import { theme } from '../theme';

export interface CapturedPhoto {
  base64: string;
  mimeType: string;
  uri: string;
}

interface CameraCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (photo: CapturedPhoto) => void;
}

// 촬영 화면 상단에 항상 노출하는 정확한 사진 촬영 가이드 체크리스트
const GUIDE_TIPS = [
  '철거할 현장 전체가 프레임 안에 들어오게',
  '밝은 곳에서, 그림자 없이 선명하게',
  '정면에서 흔들리지 않게 잡고',
  '벽·지붕·자재가 잘 보이도록',
];

/**
 * 디몰비전 AI 현장 촬영용 커스텀 카메라.
 * 뷰파인더 위에 프레이밍 가이드(사각 브래킷) + 촬영 팁을 실시간 오버레이하여
 * 사용자가 정확한 사진을 찍도록 유도한다.
 */
export function CameraCaptureModal({ visible, onClose, onCapture }: CameraCaptureModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  async function handleShutter() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true });
      if (!shot) return;
      let base64 = shot.base64 ?? '';
      // 웹 등에서 base64가 data URL로 넘어오는 경우 접두어 제거
      if (!base64 && shot.uri.startsWith('data:')) {
        base64 = shot.uri.split(',')[1] ?? '';
      }
      if (!base64) return;
      onCapture({ base64, mimeType: 'image/jpeg', uri: shot.uri });
    } finally {
      setCapturing(false);
    }
  }

  // 권한 로딩 중
  const permissionPending = !permission;
  const permissionDenied = permission && !permission.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {permissionPending ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        ) : permissionDenied ? (
          <View style={styles.centerFill}>
            <AppIcon name="camera" size={40} color="#FFFFFF" />
            <Text style={styles.permTitle}>카메라 권한이 필요해요</Text>
            <Text style={styles.permSub}>현장 사진을 촬영하려면 카메라 사용을 허용해 주세요.</Text>
            <Pressable style={styles.permBtn} onPress={requestPermission} accessibilityRole="button">
              <Text style={styles.permBtnText}>카메라 허용하기</Text>
            </Pressable>
            <Pressable style={styles.permClose} onPress={onClose} accessibilityRole="button">
              <Text style={styles.permCloseText}>닫기</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

            {/* 가이드 오버레이 (터치 통과) */}
            <View style={styles.overlay} pointerEvents="box-none">
              {/* 상단 헤더 + 촬영 팁 */}
              <View style={styles.topBar} pointerEvents="box-none">
                <View style={styles.topRow}>
                  <Text style={styles.topTitle}>📷 현장 촬영 가이드</Text>
                  <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button">
                    <Text style={styles.closeBtnText}>✕</Text>
                  </Pressable>
                </View>
                <View style={styles.tipCard}>
                  {GUIDE_TIPS.map((tip, i) => (
                    <View key={i} style={styles.tipRow}>
                      <Text style={styles.tipCheck}>✓</Text>
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* 중앙 프레이밍 가이드(사각 브래킷) */}
              <View style={styles.frameWrap} pointerEvents="none">
                <View style={styles.frameBox}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  <Text style={styles.frameHint}>이 안에 현장을 맞춰 주세요</Text>
                </View>
              </View>

              {/* 하단 컨트롤 */}
              <View style={styles.bottomBar} pointerEvents="box-none">
                <Pressable
                  style={styles.flipBtn}
                  onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                  accessibilityRole="button"
                  accessibilityLabel="카메라 전환"
                >
                  <AppIcon name="recycle" size={24} color="#FFFFFF" />
                </Pressable>

                <Pressable
                  style={styles.shutterOuter}
                  onPress={handleShutter}
                  disabled={capturing}
                  accessibilityRole="button"
                  accessibilityLabel="사진 촬영"
                >
                  {capturing ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <View style={styles.shutterInner} />
                  )}
                </Pressable>

                {/* 좌우 대칭용 스페이서 */}
                <View style={styles.flipBtnPlaceholder} />
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: '#0F172A',
  },
  permTitle: {
    color: '#FFFFFF',
    fontSize: font.title - 4,
    fontWeight: '800',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  permSub: {
    color: '#CBD5E1',
    fontSize: font.body,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 24,
  },
  permBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    minHeight: 52,
    justifyContent: 'center',
  },
  permBtnText: {
    color: '#FFFFFF',
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  permClose: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  permCloseText: {
    color: '#94A3B8',
    fontSize: font.body,
    fontWeight: '600',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  /* 상단 */
  topBar: {
    paddingTop: Platform.OS === 'web' ? spacing.md : 48,
    paddingHorizontal: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: {
    color: '#FFFFFF',
    fontSize: font.bodyLarge,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  tipCard: {
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderRadius: radius.card,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: 6,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipCheck: {
    color: '#4ADE80',
    fontSize: font.body,
    fontWeight: '900',
    width: 16,
    textAlign: 'center',
  },
  tipText: {
    color: '#F1F5F9',
    fontSize: font.body,
    fontWeight: '600',
    flex: 1,
  },

  /* 중앙 프레이밍 */
  frameWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameBox: {
    width: '82%',
    aspectRatio: 4 / 3,
    maxHeight: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#FFFFFF',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  frameHint: {
    color: '#FFFFFF',
    fontSize: font.body,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: -14,
    overflow: 'hidden',
  },

  /* 하단 */
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'web' ? spacing.lg : 40,
    paddingTop: spacing.md,
  },
  flipBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipBtnPlaceholder: {
    width: 52,
    height: 52,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
  },
});
