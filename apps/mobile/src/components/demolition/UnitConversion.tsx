import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { perSquareMeter, perTon, type FloorAreaBasis } from '@dimol/shared';
import { won } from '../../lib/format';
import { theme } from '../../theme';

/** 금액 입력 밑에 붙는 환산 줄. 근거가 없으면 아무것도 안 그린다. */
export function UnitConversion({
  amount,
  area,
  wasteTons,
}: {
  amount: number;
  area: FloorAreaBasis | null;
  wasteTons: number;
}) {
  const perM2 = perSquareMeter(amount, area);
  const perTonAmount = perTon(amount, wasteTons);
  if (perM2 === null && perTonAmount === null) return null;

  return (
    <View style={styles.conversionRow}>
      {perM2 !== null ? <Text style={styles.conversion}>㎡당 {won(perM2)}</Text> : null}
      {perTonAmount !== null ? (
        <Text style={styles.conversion}>톤당 {won(perTonAmount)}</Text>
      ) : null}
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  conversionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: -spacing.sm,
  },
  conversion: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
});
