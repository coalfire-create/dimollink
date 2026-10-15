import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon, type IconName } from '../../components/AppIcon';
import { theme } from '../../theme';

/**
 * 화면 상단 안내 카드 — 이 화면이 무엇을 해 주는 곳인지.
 *
 * 사진 한 장으로 무엇이 나오는지 모르면 사용자는 촬영을 시작하지 않는다.
 * 그래서 결과물(석면 확인·성상 분류·공정 리포트)을 먼저 적어 둔다.
 */
const HIGHLIGHTS: Array<{ icon: IconName; label: string }> = [
  { icon: 'alert', label: '석면·위험 자재 확인' },
  { icon: 'recycle', label: '폐기물 성상 분류' },
  { icon: 'document', label: '공정 주의사항 리포트' },
];

export function AnalysisIntroCard({
  title,
  badge,
  engineTag,
}: {
  title: string;
  badge: string;
  engineTag: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <View style={styles.pulseDot} />
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
        <Text style={styles.engineTag}>{engineTag}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.chipsRow}>
        {HIGHLIGHTS.map(({ icon, label }) => (
          <View key={label} style={styles.chip}>
            <AppIcon name={icon} size={13} color={colors.primary} />
            <Text style={styles.chipText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
    borderRadius: 999,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: spacing.xs,
  },
  badgeText: {
    color: colors.primaryDark,
    fontSize: font.caption,
    fontWeight: '800',
  },
  engineTag: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: font.title - 2,
    fontWeight: '800',
    lineHeight: font.title + 4,
    marginVertical: spacing.xs / 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
  },
});
