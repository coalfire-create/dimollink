import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BUILDING_STRUCTURE_LABELS,
  type BuildingStructure,
  type VolumeEstimate,
} from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { AppButton } from '../../components/ui';
import { useNavigation } from '../../navigation';
import { CostReferenceBox } from './CostReferenceBox';
import { theme } from '../../theme';

/**
 * 추정 결과 — 톤수 · 차량 대수 · 철거비 참고 · 계산 근거 · 한계 고지 · 다음 행동.
 *
 * 다섯 가지를 같이 보여주는 이유가 각각 다르다:
 *  - 차량 대수: 톤수만으로는 규모가 안 잡힌다("8톤"보다 "5톤 트럭 2대"가 읽힌다).
 *  - 철거비 참고: 물량 다음 질문은 "얼마냐"다. 근거(공공 계약)와 한계를 함께 단다.
 *  - 계산 근거: 어떤 값으로 나온 숫자인지 알아야 신뢰하거나 고칠 수 있다.
 *  - 한계 고지(서버 disclaimer): 추정치를 견적으로 오해하면 분쟁이 된다. 반드시 노출한다.
 *  - 다음 행동: 계산만 하고 끝나면 이 화면은 아무것도 남기지 못한다.
 */

const CONFIDENCE_LABELS: Record<string, string> = {
  LOW: '참고 수준',
  MEDIUM: '보통',
  HIGH: '높음',
};

export function EstimateResultCard({
  result,
  structure,
  areaNum,
  floorsNum,
}: {
  result: VolumeEstimate;
  structure: BuildingStructure | null;
  /** 철거 요청 폼에 그대로 넘길 입력값. */
  areaNum: number;
  floorsNum: number;
}) {
  const nav = useNavigation();

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.label}>예상 폐기물 양</Text>
        <View style={styles.confidenceChip}>
          <Text style={styles.confidenceText}>
            신뢰도 {CONFIDENCE_LABELS[result.confidence] ?? result.confidence}
          </Text>
        </View>
      </View>

      <Text style={styles.tons}>약 {result.estimatedTons}톤</Text>
      <Text style={styles.range}>
        예상 범위 {result.rangeMinTons} ~ {result.rangeMaxTons}톤
      </Text>

      {result.truckLoads.length > 0 ? (
        <View style={styles.truckBox}>
          <Text style={styles.truckBoxTitle}>운반 차량으로 환산하면</Text>
          {result.truckLoads.map((load) => (
            <View key={load.capacityTons} style={styles.truckRow}>
              <AppIcon name="truck" size={20} color={colors.primary} />
              <Text style={styles.truckText}>
                {load.capacityTons}톤 트럭 약 <Text style={styles.truckCount}>{load.count}대</Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.basisBox}>
        <Text style={styles.basisTitle}>계산 근거</Text>
        <Text style={styles.basisText}>
          연면적 {result.floorAreaM2.toLocaleString('ko-KR')}㎡
          {structure ? ` · ${BUILDING_STRUCTURE_LABELS[structure]}` : ' · 구조 미지정'}
        </Text>
      </View>

      <CostReferenceBox structure={structure} floorAreaM2={result.floorAreaM2} />

      <Text style={styles.disclaimer}>{result.disclaimer}</Text>

      <View style={styles.ctaBox}>
        <AppButton
          label="이 물량으로 철거 신청하기"
          onPress={() =>
            nav.push({
              name: 'requestForm',
              kind: 'DEMOLITION',
              prefill: {
                wasteTons: result.estimatedTons,
                spaceSize: String(areaNum),
                floorCount: String(floorsNum),
              },
            })
          }
        />
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryLink}
          onPress={() => nav.push({ name: 'siteAnalysis' })}
        >
          <Text style={styles.secondaryLinkText}>사진으로 더 정확히 분석하기 ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const { colors, font, spacing, radius, touch } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  confidenceChip: {
    backgroundColor: colors.background,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  confidenceText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  tons: {
    color: colors.text,
    fontSize: 48,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  range: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  truckBox: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  truckBoxTitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  truckRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  truckText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  truckCount: {
    color: colors.primary,
    fontWeight: '800',
  },
  basisBox: {
    backgroundColor: colors.background,
    borderRadius: radius.button,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  basisTitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  basisText: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  disclaimer: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: font.caption + 6,
  },
  ctaBox: {
    marginTop: spacing.md,
  },
  secondaryLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: touch.minButtonHeight,
  },
  secondaryLinkText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
});
