import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { WEB_BASE_URL } from '../api/client';
import { theme } from '../theme';

/**
 * 3D 장면 뷰어 — 서버가 서빙하는 `/scan-viewer` 페이지를 WebView 로 띄운다.
 *
 * React Native 는 3D Gaussian Splatting 을 직접 렌더링하지 못한다. 지도와 같은 이유로
 * srcDoc 이 아니라 실제 URL 을 연다 — 문서 URL 이 `about:srcdoc` 이면 상대 경로·프로토콜이
 * 깨진다([[scan-viewer-page]]).
 *
 * ⚠️ 장면 파일은 presigned URL(다른 오리진)이라 **스토리지 버킷 CORS 설정이 필요**하다.
 * 없으면 오류도 없이 "장면을 불러오는 중"에서 멈춘다.
 */
export function Scan3DViewerModal({
  visible,
  sceneUrl,
  onClose,
}: {
  visible: boolean;
  /** 장면(.ply) presigned URL. 아직 없으면 뷰어가 "복원 준비 중"을 보여준다. */
  sceneUrl?: string;
  onClose: () => void;
}) {
  const uri = `${WEB_BASE_URL}/scan-viewer${sceneUrl ? `?scene=${encodeURIComponent(sceneUrl)}` : ''}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <WebView
          source={{ uri }}
          style={styles.web}
          // 장면 파일이 수십 MB — 캐시를 켜 두 번째 열람을 빠르게 한다.
          cacheEnabled
          // 3DGS 는 WebGL 을 쓴다. 안드로이드에서 하드웨어 가속을 끄면 렌더링이 안 된다.
          androidLayerType="hardware"
          allowsInlineMediaPlayback
        />
        <Pressable onPress={onClose} style={styles.close} accessibilityRole="button">
          <Text style={styles.closeLabel}>닫기</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: '#101418', flex: 1 },
  web: { flex: 1 },
  close: {
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: radius.card,
    justifyContent: 'center',
    margin: spacing.md,
    minHeight: 48,
  },
  closeLabel: { color: '#FFFFFF', fontSize: font.body, fontWeight: '800' },
});
