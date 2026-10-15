import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 자유 촬영의 상단 가이드 — 다음에 찍으면 좋은 컷과 촬영 팁.
 *
 * 가이드 촬영(GuidedSiteCaptureModal)처럼 순서를 강제하지는 않는다. 여기서는 막는 대신
 * **다음에 무엇을 찍으면 좋은지** 계속 제안한다. 한 장만 찍고 끝내면 분석이 얕아지는데,
 * 그 이유를 화면에서 말해 주지 않으면 사용자는 한 장으로 충분한 줄 안다.
 */
/** 촬영 화면 상단에 항상 노출하는 체크리스트. */
const GUIDE_TIPS = [
  '밝은 곳에서, 그림자 없이 선명하게',
  '정면에서 흔들리지 않게 잡고',
  '여러 각도로 3~4장 찍으면 분석이 정확해져요',
];

/**
 * 다중 촬영을 유도하는 순서 가이드.
 * 마지막 항목은 계속 반복 노출된다 — 정해진 컷을 다 찍은 뒤에도 보강 촬영을 열어 둔다.
 */
const SHOT_GUIDE = [
  { emoji: '🏠', label: '① 현장 전경', hint: '건물·현장 전체가 한 화면에 들어오게' },
  { emoji: '🧱', label: '② 벽·바닥 근접', hint: '주요 벽체·바닥 마감재가 잘 보이게 가까이' },
  { emoji: '🔺', label: '③ 지붕·천장', hint: '지붕재·천장 구조를 위로 향해 촬영' },
  { emoji: '⚠️', label: '④ 위험·특이 부위', hint: '석면 의심 슬레이트·배관·설비 등 우려 부위' },
  { emoji: '📸', label: '추가 각도', hint: '놓친 부분을 다른 각도로 보강 촬영' },
];

export function ShotGuidePanel({
  shotCount,
  onClose,
}: {
  /** 지금까지 찍은 장수 — 다음에 찍을 컷을 고르는 데 쓴다. */
  shotCount: number;
  onClose: () => void;
}) {
  const next = SHOT_GUIDE[Math.min(shotCount, SHOT_GUIDE.length - 1)];

  return (
    <View style={styles.topBar} pointerEvents="box-none">
      <View style={styles.topRow}>
        <Text style={styles.topTitle}>📷 현장 촬영 가이드</Text>
        <Pressable
          style={styles.closeBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="촬영 닫기"
        >
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.nextGuideCard}>
        <Text style={styles.nextGuideLabel}>
          {next.emoji} 다음 촬영: {next.label}
        </Text>
        <Text style={styles.nextGuideHint}>{next.hint}</Text>
      </View>

      <View style={styles.tipCard}>
        {GUIDE_TIPS.map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <Text style={styles.tipCheck}>✓</Text>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
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
    color: colors.background,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  closeBtn: {
    width: touch.minButtonHeight,
    height: touch.minButtonHeight,
    borderRadius: touch.minButtonHeight / 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: colors.background,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  nextGuideCard: {
    backgroundColor: 'rgba(37,99,235,0.85)',
    borderRadius: radius.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  nextGuideLabel: {
    color: colors.background,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  nextGuideHint: {
    color: colors.primarySoft,
    fontSize: font.body,
    fontWeight: '600',
    marginTop: spacing.xs / 2,
  },
  tipCard: {
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderRadius: radius.card,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipCheck: {
    color: colors.successOnDark,
    fontSize: font.body,
    fontWeight: '900',
    width: 16,
    textAlign: 'center',
  },
  tipText: {
    color: colors.surface,
    fontSize: font.body,
    fontWeight: '600',
    flex: 1,
  },
});
