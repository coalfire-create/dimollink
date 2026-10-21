import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { theme } from '../../theme';
import { TABULAR_NUMS } from '../../lib/format';

export interface AmountDisplayProps {
  value: number;
  unit?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'text' | 'primary' | 'secondary' | 'error' | 'muted';
  align?: 'left' | 'center' | 'right';
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
  unitStyle?: StyleProp<TextStyle>;
}

/**
 * 고령 사용자 및 현장 작업자를 위한 금액/숫자 위계 디스플레이 컴포넌트.
 *
 * 1. fontVariant: ['tabular-nums'] 를 적용하여 자릿수가 달라져도 글자가 흔들리지 않음.
 * 2. 숫자는 크고 굵게(bold), 단위('원', '톤')는 약간 작고 단정하게 렌더링하여 숫자가 한눈에 읽힘.
 */
export function AmountDisplay({
  value,
  unit = '원',
  size = 'md',
  color = 'text',
  align = 'left',
  style,
  valueStyle,
  unitStyle,
}: AmountDisplayProps) {
  const formatted = value.toLocaleString('ko-KR');

  const textColor =
    color === 'primary'
      ? colors.primary
      : color === 'secondary'
        ? colors.secondary
        : color === 'error'
          ? colors.error
          : color === 'muted'
            ? colors.textMuted
            : colors.text;

  return (
    <View style={[styles.container, alignStyles[align], style]}>
      <Text style={[styles.numberBase, sizeStyles[size].number, { color: textColor }, valueStyle]}>
        {formatted}
      </Text>
      <Text style={[styles.unitBase, sizeStyles[size].unit, { color: textColor }, unitStyle]}>
        {unit}
      </Text>
    </View>
  );
}

const { colors, font, spacing } = theme;

const alignStyles = StyleSheet.create({
  left: { justifyContent: 'flex-start' },
  center: { justifyContent: 'center' },
  right: { justifyContent: 'flex-end' },
});

const sizeStyles = {
  sm: StyleSheet.create({
    number: { fontSize: font.body, fontWeight: '700' },
    unit: { fontSize: font.caption, fontWeight: '500', marginLeft: spacing.xs / 2 },
  }),
  md: StyleSheet.create({
    number: { fontSize: font.bodyLarge, fontWeight: '700' },
    unit: { fontSize: font.body, fontWeight: '500', marginLeft: spacing.xs / 2 },
  }),
  lg: StyleSheet.create({
    number: { fontSize: font.title, fontWeight: '800' },
    unit: { fontSize: font.bodyLarge, fontWeight: '600', marginLeft: spacing.xs / 2 },
  }),
  xl: StyleSheet.create({
    number: { fontSize: 32, fontWeight: '900' },
    unit: { fontSize: font.title, fontWeight: '700', marginLeft: spacing.xs / 2 },
  }),
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'baseline',
    flexDirection: 'row',
  },
  numberBase: {
    ...TABULAR_NUMS,
    includeFontPadding: false,
  },
  unitBase: {
    includeFontPadding: false,
  },
});
