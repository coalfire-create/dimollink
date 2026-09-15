import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SITE_CAPTURE_COPY } from '@dimol/shared';
import { AppIcon } from '../AppIcon';
import type { OrientationPermission } from '../../lib/useDeviceOrientation';
import { theme } from '../../theme';

/**
 * 촬영 화면 상단 — 진행률, 점 표시, 지금 찍어야 할 곳 안내.
 *
 * 몇 장 중 몇 장인지를 숫자와 점으로 같이 보여준다. 가이드 촬영은 중간에 그만두면
 * 분석이 반쪽이 되는데, 남은 개수가 보이지 않으면 사용자는 임의로 멈춘다.
 */
export function CaptureTopBar({
  progress,
  total,
  instruction,
  sensorPermission,
  onRequestSensor,
  onClose,
}: {
  progress: number;
  total: number;
  instruction?: string;
  sensorPermission: OrientationPermission;
  onRequestSensor: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.topBar} pointerEvents="box-none">
      <View style={styles.topRow}>
        <Text style={styles.progressText}>{SITE_CAPTURE_COPY.progress(progress)}</Text>
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="촬영 닫기"
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.dotsRow}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[styles.dot, index < progress ? styles.dotDone : styles.dotPending]}
          />
        ))}
      </View>

      {instruction ? (
        <View style={styles.instructionCard}>
          <Text style={styles.instructionText}>{instruction}</Text>
        </View>
      ) : null}

      {/* iOS 웹은 방향 센서에 사용자 제스처 기반 권한이 필요하다 — 눌러야 켜진다. */}
      {Platform.OS === 'web' && sensorPermission === 'prompt' ? (
        <Pressable style={styles.sensorBanner} onPress={onRequestSensor} accessibilityRole="button">
          <AppIcon name="alert" size={16} color={colors.background} />
          <Text style={styles.sensorBannerText}>
            방향 안내를 켜려면 눌러서 센서 사용을 허용해주세요
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  topBar: {
    paddingTop: Platform.OS === 'web' ? spacing.md : 48,
    paddingHorizontal: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  progressText: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '800',
    flex: 1,
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
  closeBtnText: { color: colors.background, fontSize: 20, fontWeight: '700' },
  dotsRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  dot: { flex: 1, height: 5, borderRadius: 999 },
  dotDone: { backgroundColor: colors.primary },
  dotPending: { backgroundColor: 'rgba(255,255,255,0.3)' },
  instructionCard: {
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: radius.card,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  instructionText: {
    color: colors.background,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    lineHeight: 28,
  },
  sensorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(37,99,235,0.9)',
    borderRadius: radius.card,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  sensorBannerText: { color: colors.background, fontSize: font.body, fontWeight: '700', flex: 1 },
});
