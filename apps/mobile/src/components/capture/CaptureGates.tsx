import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SITE_CAPTURE_COPY } from '@dimol/shared';
import { AppIcon } from '../AppIcon';
import { theme } from '../../theme';

/**
 * 촬영 전후의 전체화면 상태 — 권한 요청과 완료 안내.
 *
 * 둘 다 카메라 대신 화면 전체를 덮는다. 권한이 없으면 찍을 수 없고, 다 찍었으면
 * 더 찍을 게 없어서 카메라를 계속 띄워 둘 이유가 없다(배터리·발열도 준다).
 */
export function CameraPermissionGate({
  onAllow,
  onClose,
}: {
  onAllow: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.centerFill}>
      <AppIcon name="camera" size={40} color={colors.background} />
      <Text style={styles.permTitle}>카메라 권한이 필요해요</Text>
      <Text style={styles.permSub}>현장 사진을 촬영하려면 카메라 사용을 허용해 주세요.</Text>
      <Pressable style={styles.permBtn} onPress={onAllow} accessibilityRole="button">
        <Text style={styles.permBtnText}>카메라 허용하기</Text>
      </Pressable>
      <Pressable style={styles.permClose} onPress={onClose} accessibilityRole="button">
        <Text style={styles.permCloseText}>닫기</Text>
      </Pressable>
    </View>
  );
}

export function CaptureCompleteView({ count, onNext }: { count: number; onNext: () => void }) {
  return (
    <View style={styles.centerFill}>
      <View style={styles.completeCircle}>
        <AppIcon name="sparkles" size={40} color={colors.background} />
      </View>
      <Text style={styles.completeTitle}>{SITE_CAPTURE_COPY.complete}</Text>
      <Text style={styles.completeSub}>현장 사진 {count}장을 정리했어요.</Text>
      <Pressable style={styles.permBtn} onPress={onNext} accessibilityRole="button">
        <Text style={styles.permBtnText}>다음 단계로</Text>
      </Pressable>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.text,
  },
  permTitle: {
    color: colors.background,
    fontSize: font.title - 4,
    fontWeight: '800',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  permSub: {
    color: colors.border,
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
  permBtnText: { color: colors.background, fontSize: font.bodyLarge, fontWeight: '800' },
  permClose: { marginTop: spacing.md, padding: spacing.sm },
  permCloseText: { color: colors.textMuted, fontSize: font.body, fontWeight: '600' },
  completeCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  completeTitle: {
    color: colors.background,
    fontSize: font.title - 2,
    fontWeight: '800',
    textAlign: 'center',
  },
  completeSub: {
    color: colors.border,
    fontSize: font.body,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
