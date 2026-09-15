import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { USER_TYPE_LABELS, type UserProfile } from '@dimol/shared';
import { theme } from '../../theme';

/**
 * 마이페이지 상단 프로필 — 이름·가입 유형·지역과 인증 배지.
 *
 * 배지(올바로·보험·허가증)는 업체가 일감을 받을 자격이 있는지 배출자가 보는 표시라,
 * 본인 화면에서도 지금 무엇이 붙어 있는지 한눈에 확인할 수 있어야 한다.
 */
export function ProfileHero({ user }: { user: UserProfile }) {
  const badges = [
    user.allbaroCertified ? '올바로 인증' : null,
    user.insuranceRegistered ? '보험 가입' : null,
    user.permitRegistered ? '허가증' : null,
  ].filter((badge): badge is string => badge !== null);

  return (
    <View style={styles.hero}>
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name.trim().charAt(0) || '비'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.role}>
            {USER_TYPE_LABELS[user.userType] ?? user.userType} · {user.region}
          </Text>
        </View>
      </View>
      {badges.length > 0 ? (
        <View style={styles.badgeRow}>
          {badges.map((badge) => (
            <View key={badge} style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 72,
  },
  avatarText: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    color: colors.background,
    fontSize: font.titleLarge,
    fontWeight: '800',
  },
  role: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.badge,
    marginRight: spacing.xs,
    marginTop: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '700',
  },
});
