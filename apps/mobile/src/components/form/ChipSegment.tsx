import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormSectionLabel } from './FormSectionLabel';
import { theme } from '../../theme';

/**
 * 칩 단일 선택 그룹 — 선택지가 3~6개일 때(건물 종류, 철거 종류 등).
 *
 * 드롭다운 대신 칩을 쓰는 이유는 선택지가 열기 전에도 전부 보이고, 터치 영역이
 * 글자보다 넓어서다. 선택지가 늘어나면 줄바꿈으로 흐른다.
 */
export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function ChipSegment<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <>
      {label ? <FormSectionLabel>{label}</FormSectionLabel> : null}
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: 'transparent',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
    marginBottom: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
