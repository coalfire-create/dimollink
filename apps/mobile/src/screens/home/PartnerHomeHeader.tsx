import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/AppIcon';
import { TABULAR_NUMS } from '../../lib/format';
import { useWideLayout } from '../../lib/layout';
import { useNavigation } from '../../navigation';
import { theme } from '../../theme';

/**
 * 업체 홈 머리 — 인사 + 지금 상황 한 줄 + 숫자 두 개(새로 들어온 일 / 진행 중인 일).
 *
 * 예전에는 세 업체 홈(철거·운반·처리장)이 각자 파란 장식 배너("비움 파트너스")를 맨 위에
 * 두었다. 업체가 홈을 여는 이유는 "새 일이 들어왔나"인데 그 답은 배너 아래로 스크롤해야
 * 보였다. 숫자를 맨 위에 크게 두고, 진행 중 숫자를 누르면 목록 탭으로 간다.
 */
export function PartnerHomeHeader({
  name,
  openCount,
  openLabel,
  activeCount,
  activeLabel,
  badge,
  canOpenList,
}: {
  name: string;
  openCount: number;
  /** 예: "새 철거 요청", "들어온 콜". */
  openLabel: string;
  activeCount: number;
  /** 예: "수주한 철거", "수락한 콜". */
  activeLabel: string;
  /** 이름 아래 상태 칩(예: 처리장의 운반 제공 여부). */
  badge?: string;
  /** 진행 중 숫자를 눌렀을 때 갈 목록 탭이 있는지 — 없는 역할은 숫자만 보여준다([[requestsTabLabel]]). */
  canOpenList: boolean;
}) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  // 데스크톱 웹은 넓은 화면에 맞춰 제목을 한 단계 키운다.
  const wide = useWideLayout();
  const headline =
    openCount > 0
      ? `${openLabel} ${openCount}건이\n기다리고 있어요`
      : activeCount > 0
        ? `진행 중인 일 ${activeCount}건을\n확인해 보세요`
        : '지금은 새로 들어온 일이 없어요';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.name}>{name}</Text>
      <Text style={[styles.headline, wide && styles.headlineWide]} accessibilityRole="header">
        {headline}
      </Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {/* 숫자 두 개를 한 장의 요약 카드에 — 칸 두 개를 따로 띄우면 버튼처럼 보였다. */}
      <View style={styles.stats}>
        <View style={styles.stat} accessibilityLabel={`${openLabel} ${openCount}건`}>
          <Text style={styles.statLabel}>{openLabel}</Text>
          <Text style={[styles.statValue, openCount > 0 && styles.statValueStrong]}>
            {openCount}
            <Text style={styles.statUnit}>건</Text>
          </Text>
        </View>
        <View style={styles.statDivider} />
        {canOpenList ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${activeLabel} ${activeCount}건, 목록 보기`}
            onPress={() => nav.switchTab('requests')}
            style={styles.stat}
          >
            <View style={styles.statLabelRow}>
              <Text style={styles.statLabel}>{activeLabel}</Text>
              <AppIcon name="chevronRight" size={18} color={colors.textMuted} />
            </View>
            <Text style={styles.statValue}>
              {activeCount}
              <Text style={styles.statUnit}>건</Text>
            </Text>
          </Pressable>
        ) : (
          <View style={styles.stat} accessibilityLabel={`${activeLabel} ${activeCount}건`}>
            <Text style={styles.statLabel}>{activeLabel}</Text>
            <Text style={styles.statValue}>
              {activeCount}
              <Text style={styles.statUnit}>건</Text>
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  name: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  headline: {
    color: colors.text,
    fontSize: font.titleLarge,
    letterSpacing: theme.tracking.title,
    fontWeight: '700',
    lineHeight: 38,
    marginTop: spacing.xs,
  },
  headlineWide: {
    fontSize: font.display,
    letterSpacing: theme.tracking.display,
    lineHeight: 48,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.badge,
    borderWidth: 1,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
  stats: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: spacing.md,
    overflow: 'hidden',
    paddingVertical: spacing.sm,
    ...theme.shadow.card,
  },
  stat: {
    flex: 1,
    justifyContent: 'center',
    minHeight: theme.touch.primaryButtonHeight + spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statDivider: { backgroundColor: colors.border, width: 1 },
  statLabelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs / 2 },
  statLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  statValue: {
    color: colors.text,
    fontSize: font.titleLarge + 4,
    fontWeight: '700',
    letterSpacing: theme.tracking.title,
    marginTop: spacing.xs / 2,
    ...TABULAR_NUMS,
  },
  statUnit: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '600',
  },
  statValueStrong: {
    color: colors.primary,
  },
});
