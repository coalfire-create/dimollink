import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { m2ToPyeong } from '@dimol/shared';
import { Field } from '../../components/ui';
import { SegmentedToggle } from '../../components/form/SegmentedToggle';
import { StepHeader } from '../../components/form/StepHeader';
import { theme } from '../../theme';
import type { AreaUnit, VolumeEstimateState } from './useVolumeEstimate';

/**
 * 1단계 — 면적과 층수.
 *
 * 한 층 바닥면적을 받고 층수를 곱해 연면적을 보여준다. 연면적을 직접 묻지 않는 이유:
 * 사용자는 대개 "우리 가게 30평"처럼 한 층 기준으로 알고 있고, 연면적을 물으면
 * 층수를 곱해야 하는지 헷갈려 한 층 값을 그대로 적는다.
 */
const AREA_UNITS: Array<{ value: AreaUnit; label: string }> = [
  { value: 'PYEONG', label: '평' },
  { value: 'M2', label: '㎡' },
];

export function AreaStep({ estimate }: { estimate: VolumeEstimateState }) {
  const { unit, totalAreaM2 } = estimate;
  return (
    <>
      <StepHeader index={1} title="건물 면적" />

      <SegmentedToggle options={AREA_UNITS} value={unit} onChange={estimate.changeUnit} />

      <Field
        label={unit === 'PYEONG' ? '한 층 바닥면적 (평)' : '한 층 바닥면적 (㎡)'}
        value={estimate.area}
        onChangeText={estimate.changeArea}
        placeholder={unit === 'PYEONG' ? '예) 30' : '예) 99'}
        keyboardType="numeric"
        hint={
          unit === 'PYEONG' ? '평수를 모르면 ㎡ 로 바꿔서 입력하세요.' : '30평 ≈ 99㎡ · 1평 ≈ 3.3㎡'
        }
      />

      <Field
        label="층수"
        value={estimate.floors}
        onChangeText={estimate.changeFloors}
        placeholder="예) 2"
        keyboardType="numeric"
        hint="지하층이 있으면 함께 세어 주세요."
      />

      {totalAreaM2 !== null ? (
        <View style={styles.totalAreaBox}>
          <Text style={styles.totalAreaLabel}>연면적 합계</Text>
          <Text style={styles.totalAreaValue}>
            {totalAreaM2.toLocaleString('ko-KR')}㎡
            <Text style={styles.totalAreaSub}>
              {'  '}({m2ToPyeong(totalAreaM2).toLocaleString('ko-KR')}평)
            </Text>
          </Text>
        </View>
      ) : null}
    </>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  totalAreaBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  totalAreaLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
  totalAreaValue: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  totalAreaSub: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
  },
});
