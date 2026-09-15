import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 분절 토글 — 선택지 2~3개를 한 줄에 꽉 채워 보여준다(면적 단위 평/㎡ 등).
 *
 * ChipSegment 와 나눠 둔 이유: 이건 "같은 값을 다른 단위로 볼까"처럼 **서로 대체되는**
 * 선택이라, 칩처럼 흩어 놓지 않고 한 덩어리로 붙여 놔야 대체 관계가 보인다.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.option, active && styles.optionActive]}
          >
            <Text style={[styles.optionText, active && styles.optionTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: spacing.xs / 2,
  },
  option: {
    alignItems: 'center',
    borderRadius: radius.button - 4,
    flex: 1,
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight - 8,
  },
  optionActive: {
    backgroundColor: colors.background,
    ...theme.shadow.card,
  },
  optionText: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  optionTextActive: {
    color: colors.primary,
  },
});
