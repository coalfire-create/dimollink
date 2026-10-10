import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_LABELS,
  PUBLIC_DEMOLITION_BASELINE,
  publicPriceReference,
  type BuildingStructure,
  type FloorAreaBasis,
} from '@dimol/shared';
import { won } from '../../lib/format';
import { theme } from '../../theme';

/**
 * 구조·규모가 비슷한 공공 철거 계약(나라장터)의 시세. 업체가 개산을 낼 때 "너무 동떨어지지
 * 않았나"를 보는 참고선이다. 공공 공사는 민간보다 비싸고 편차가 커서, 출발점(눌러서 채우기)으로
 * 쓰지 않고 읽기 전용으로만 보여준다. 맞는 구간이 없으면 아무것도 그리지 않는다.
 */
export function PublicPriceReferenceNote({
  structure,
  area,
}: {
  structure: BuildingStructure | undefined;
  area: FloorAreaBasis | null;
}) {
  const ref = publicPriceReference(PUBLIC_DEMOLITION_BASELINE, structure, area?.m2);
  if (!ref) return null;

  return (
    <View style={styles.box} accessibilityRole="summary">
      <Text style={styles.label}>
        공공 철거 계약 참고 ({BUILDING_STRUCTURE_LABELS[ref.structure]} · {ref.minM2}~{ref.maxM2}㎡,{' '}
        {ref.count}건)
      </Text>
      <Text style={styles.range}>
        {won(ref.minAmount)} ~ {won(ref.maxAmount)}
      </Text>
      <Text style={styles.note}>
        ㎡당 중간값 {won(ref.perSqm.median)}. 관공서 발주라 민간 견적보다 높게 나오는 편입니다.
      </Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  box: {
    borderColor: colors.border,
    borderRadius: radius.button,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  range: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  note: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
});
