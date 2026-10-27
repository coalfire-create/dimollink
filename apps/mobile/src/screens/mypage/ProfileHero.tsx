import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { USER_TYPE_LABELS, type UserProfile } from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { IconTile } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 마이페이지 상단 프로필 — 이름·가입 유형·지역과 인증 배지.
 *
 * 배지(올바로·보험·허가증)는 업체가 일감을 받을 자격이 있는지 배출자가 보는 표시라,
 * 본인 화면에서도 지금 무엇이 붙어 있는지 한눈에 확인할 수 있어야 한다.
 *
 * 바로가기 타일(이용내역·알림)은 하단 탭과 겹쳐서 뺐다.
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
});
