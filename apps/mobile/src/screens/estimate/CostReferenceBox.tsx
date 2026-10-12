import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_LABELS,
  PUBLIC_DEMOLITION_BASELINE,
  publicPriceReference,
  type BuildingStructure,
} from '@dimol/shared';
import { manwon } from '../../lib/format';
import { theme } from '../../theme';

/**
 * 예상 철거비 참고 — 구조·규모가 비슷한 공공 철거 계약(나라장터) 금액 범위.
 *
 * 요청자가 물량 다음으로 궁금한 건 "그래서 얼마냐"인데, 업체 견적 전에는 근거 있는 숫자가
 * 없다. 공공 계약은 민간보다 높게 나오는 편이라 "예상 금액"이 아니라 "참고"로 이름 붙이고,
 * 상한 쪽이라는 걸 같이 적는다. 업체 개산 화면의 [[PublicPriceReferenceNote]] 와 같은
 * 기준표·같은 규칙(구간·최소 표본)을 쓴다 — 요청자와 업체가 서로 다른 시세를 보면 안 된다.
 *
 * 맞는 구간이 없을 때도 빈칸으로 두지 않고 이유를 말한다. 구조를 안 골랐으면 고르라고,
 * 규모가 비교 대상 밖이면 업체 견적으로 확인하라고.
 */
export function CostReferenceBox({
  structure,
  floorAreaM2,
}: {
  structure: BuildingStructure | null;
  floorAreaM2: number;
}) {
  const ref = publicPriceReference(PUBLIC_DEMOLITION_BASELINE, structure ?? undefined, floorAreaM2);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>철거비 참고</Text>
      {ref ? (
        <>
          <Text style={styles.range}>
            {manwon(ref.minAmount)} ~ {manwon(ref.maxAmount)}
          </Text>
          <Text style={styles.note}>
            비슷한 공공 철거 계약 {ref.count}건 기준 ({BUILDING_STRUCTURE_LABELS[ref.structure]} ·{' '}
            {ref.minM2}~{ref.maxM2}㎡). 관공서 공사라 실제 민간 견적은 대개 이보다 낮습니다.
          </Text>
        </>
      ) : (
        <Text style={styles.note}>
          {structure
            ? '이 규모는 비교할 공공 계약이 적어 금액은 업체 견적으로 확인해 주세요.'
            : '위에서 건물 구조를 고르고 다시 계산하면 비슷한 공사의 금액도 알려드려요.'}
        </Text>
      )}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  title: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  range: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  note: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: font.caption + 6,
    marginTop: spacing.xs / 2,
  },
});
