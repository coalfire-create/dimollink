import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { USER_TYPE_LABELS, type UserProfile } from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { theme } from '../../theme';

/**
 * 마이페이지 상단 프로필 — 다크 스튜디오 명판 + 이름·가입 유형·지역·자격 배지.
 */
export function ProfileHero({ user }: { user: UserProfile }) {
  const badges = [
    user.allbaroCertified ? '올바로 인증' : null,
    user.insuranceRegistered ? '보험 가입' : null,
    user.permitRegistered ? '허가증' : null,
  ].filter((badge): badge is string => badge !== null);

  return (
    <View style={styles.card}>
      <View style={styles.profileRow}>
        <View style={styles.monogram}>
          <Text style={styles.monogramText}>{user.name.trim().charAt(0) || '비'}</Text>
        </View>
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
              <AppIcon name="check" size={16} color={colors.successOnDark} />
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius, onDark } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: onDark.canvas,
    borderColor: onDark.border,
    borderRadius: radius.button,
    borderWidth: 1,
    marginBottom: spacing.sm,
    padding: spacing.lg,
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  monogram: {
    alignItems: 'center',
    backgroundColor: onDark.surface,
    borderColor: onDark.border,
    borderRadius: radius.badge,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 56,
  },
  monogramText: {
    color: colors.background,
    fontSize: font.title,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    color: colors.background,
    fontSize: font.titleLarge,
    letterSpacing: theme.tracking.title,
    fontWeight: '700',
  },
  role: {
    color: onDark.text,
    fontSize: font.body,
    marginTop: 4,
  },
  badgeRow: {
    borderTopColor: onDark.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: onDark.surface,
    borderColor: onDark.border,
    borderRadius: radius.badge,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    color: onDark.text,
    fontSize: font.body,
    fontWeight: '600',
  },
});
