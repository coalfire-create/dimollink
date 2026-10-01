import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

export type DevRoleKey = 'CONSUMER' | 'DEMOLITION' | 'TRANSPORT' | 'TREATMENT' | 'INTERIOR';

const ROLES: { key: DevRoleKey; label: string }[] = [
  { key: 'CONSUMER', label: '👤 소비자' },
  { key: 'DEMOLITION', label: '🏗 철거' },
  { key: 'TRANSPORT', label: '🚚 운반' },
  { key: 'TREATMENT', label: '🏭 처리장' },
  { key: 'INTERIOR', label: '🛠 인테리어' },
];

/**
 * UI 검증용 바로가기 — 로그인 없이 역할별 홈으로 들어간다.
 * 개발 빌드(__DEV__)에서만 첫 화면이 이걸 그린다(운영 빌드에는 안 나온다).
 */
export function DevRoleShortcuts({ onSelect }: { onSelect: (role: DevRoleKey) => void }) {
  return (
    <View style={styles.devSection}>
      <Text style={styles.devSectionTitle}>⚡️ UI 검증용 바로가기 (로그인 없이 바로 진입)</Text>
      <View style={styles.devGrid}>
        {ROLES.map((role) => (
          <Pressable key={role.key} style={styles.devChip} onPress={() => onSelect(role.key)}>
            <Text style={styles.devChipText}>{role.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  devSection: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  devSectionTitle: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  devGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  devChip: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  devChipText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
});
