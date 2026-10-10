import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 항목 제목 줄 — 제목 + 상태 배지(다 찍음 / 꼭 필요 / 있으면 좋아요).
 * 배지 색은 뜻이 있는 상태색만 쓴다(완료 = 초록, 남음 = 메인 연한 톤).
 */
export function ItemStatus({
  title,
  done,
  required,
}: {
  title: string;
  done: boolean;
  required: boolean;
}) {
  const label = done ? '✓ 다 찍음' : required ? '꼭 필요' : '있으면 좋아요';
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <View style={[styles.badge, done ? styles.badgeDone : styles.badgeTodo]}>
        <Text style={[styles.badgeText, done ? styles.badgeTextDone : styles.badgeTextTodo]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  badge: {
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
  },
  badgeDone: { backgroundColor: colors.successSoft },
  badgeTodo: { backgroundColor: colors.primarySoft },
  badgeText: { fontSize: font.caption, fontWeight: '700' },
  badgeTextDone: { color: colors.success },
  badgeTextTodo: { color: colors.primary },
});
