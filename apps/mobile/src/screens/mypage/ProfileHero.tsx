import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { USER_TYPE_LABELS, type UserProfile } from '@dimol/shared';
import { AppIcon, type IconName } from '../../components/AppIcon';
import { IconTile } from '../../components/ui';
import { PressableScale } from '../../components/motion';
import { theme } from '../../theme';

/**
 * 마이페이지 상단 프로필 — 이름·가입 유형·지역과 인증 배지, 그리고 자주 가는 곳 바로가기.
 *
 * 배지(올바로·보험·허가증)는 업체가 일감을 받을 자격이 있는지 배출자가 보는 표시라,
 * 본인 화면에서도 지금 무엇이 붙어 있는지 한눈에 확인할 수 있어야 한다.
 *
 * 예전에는 파란 곡선 배너였다. 흰 카드 + 큰 이름으로 바꾸고, 메뉴 목록 맨 위 세 줄을
 * 아이콘 타일로 끌어올렸다 — 가장 자주 누르는 곳을 목록에서 찾지 않게.
 */
export interface ProfileShortcut {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}

export function ProfileHero({
  user,
  shortcuts,
}: {
  user: UserProfile;
  shortcuts: ProfileShortcut[];
}) {
  const badges = [
    user.allbaroCertified ? '올바로 인증' : null,
    user.insuranceRegistered ? '보험 가입' : null,
    user.permitRegistered ? '허가증' : null,
  ].filter((badge): badge is string => badge !== null);

  return (
    <View style={styles.card}>
      <View style={styles.profileRow}>
        <IconTile label={user.name.trim().charAt(0) || '비'} size="lg" style={styles.avatar} />
        <View style={styles.profileInfo}>
          <Text style={styles.name} accessibilityRole="header">
            {user.name}
          </Text>
          <Text style={styles.role}>
            {USER_TYPE_LABELS[user.userType] ?? user.userType} · {user.region}
          </Text>
        </View>
      </View>
      {badges.length > 0 ? (
        <View style={styles.badgeRow}>
          {badges.map((badge) => (
            <View key={badge} style={styles.badge}>
              <AppIcon name="check" size={16} color={colors.primary} />
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {shortcuts.length > 0 ? (
        <View style={styles.shortcuts}>
          {shortcuts.map((s) => (
            <PressableScale
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              onPress={s.onPress}
              style={styles.shortcut}
            >
              <IconTile icon={s.icon} size="sm" />
              <Text style={styles.shortcutLabel} numberOfLines={1}>
                {s.label}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    marginRight: spacing.sm,
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  role: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  shortcuts: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  shortcut: {
    alignItems: 'center',
    borderRadius: radius.button,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: theme.touch.primaryButtonHeight + spacing.md,
    paddingVertical: spacing.xs,
  },
  shortcutLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '700',
  },
});
