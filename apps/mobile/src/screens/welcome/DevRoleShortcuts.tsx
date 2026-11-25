import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

export type DevRoleKey = 'CONSUMER' | 'DEMOLITION' | 'TRANSPORT' | 'TREATMENT' | 'INTERIOR';

const ROLES: { key: DevRoleKey; code: string; label: string }[] = [
  { key: 'CONSUMER', code: '01', label: '소비자' },
  { key: 'DEMOLITION', code: '02', label: '철거' },
  { key: 'TRANSPORT', code: '03', label: '운반' },
  { key: 'TREATMENT', code: '04', label: '처리장' },
  { key: 'INTERIOR', code: '05', label: '인테리어' },
];

/**
 * UI 검증용 바로가기 — 로그인 없이 역할별 홈으로 들어간다.
 * 개발 빌드(__DEV__)에서만 첫 화면이 이걸 그린다(운영 빌드에는 안 나온다).
 */
export function DevRoleShortcuts({ onSelect }: { onSelect: (role: DevRoleKey) => void }) {
  return (
    <View style={styles.devSection}>
      <Text style={styles.devSectionTitle}>DEV // 역할별 바로 진입</Text>
      <View style={styles.devGrid}>
        {ROLES.map((role) => (
          <Pressable
            key={role.key}
            accessibilityRole="button"
            accessibilityLabel={`${role.label} 역할로 바로 들어가기`}
            style={styles.devChip}
            onPress={() => onSelect(role.key)}
          >
            <Text style={styles.devChipCode}>{role.code}</Text>
            <Text style={styles.devChipText}>{role.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const { colors, font, spacing, radius, onDark } = theme;

const styles = StyleSheet.create({
  devSection: {
    borderTopColor: onDark.border,
    borderTopWidth: 1,
    marginTop: spacing.lg,
    paddingTop: spacing.sm,
  },
  devSectionTitle: {
    color: onDark.textMuted,
    fontSize: font.caption,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  devGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  devChip: {
    alignItems: 'center',
    backgroundColor: onDark.surface,
    borderColor: onDark.border,
    borderRadius: radius.badge,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs / 2,
    minHeight: theme.touch.minButtonHeight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  devChipCode: {
    color: colors.primarySoft,
    fontSize: font.caption,
    fontWeight: '700',
  },
  devChipText: {
    color: onDark.text,
    fontSize: font.caption,
    fontWeight: '600',
  },
});
