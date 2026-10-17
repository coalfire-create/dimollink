import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const headline =
    openCount > 0
      ? `${openLabel} ${openCount}건이\n기다리고 있어요`
      : activeCount > 0
        ? `진행 중인 일 ${activeCount}건을\n확인해 보세요`
        : '지금은 새로 들어온 일이 없어요';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.headline} accessibilityRole="header">
        {headline}
      </Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.stats}>
        <View style={styles.stat} accessibilityLabel={`${openLabel} ${openCount}건`}>
          <Text style={styles.statLabel}>{openLabel}</Text>
          <Text style={[styles.statValue, openCount > 0 && styles.statValueStrong]}>
            {openCount}건
          </Text>
        </View>
        {canOpenList ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${activeLabel} ${activeCount}건, 목록 보기`}
            onPress={() => nav.switchTab('requests')}
            style={styles.stat}
          >
            <Text style={styles.statLabel}>{activeLabel} ›</Text>
            <Text style={styles.statValue}>{activeCount}건</Text>
          </Pressable>
        ) : (
          <View style={styles.stat} accessibilityLabel={`${activeLabel} ${activeCount}건`}>
            <Text style={styles.statLabel}>{activeLabel}</Text>
            <Text style={styles.statValue}>{activeCount}건</Text>
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
    fontWeight: '800',
    lineHeight: 38,
    marginTop: spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  stat: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    flex: 1,
    minHeight: theme.touch.primaryButtonHeight + spacing.lg,
    padding: spacing.sm,
    ...theme.shadow.card,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  statValue: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  statValueStrong: {
    color: colors.primary,
  },
});
