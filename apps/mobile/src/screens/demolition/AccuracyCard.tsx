import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ProviderEstimateAccuracy } from '@dimol/shared';
import { Card } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 내 개산 정확도 — 개산 대비 확정이 평균 얼마나 벌어졌는지.
 *
 * 범위를 얼마나 넓게 잡을지 판단하는 근거이자, **소비자에게도 보이는 지표**다.
 * 실적이 3건 미만이면 숫자를 내지 않는다 — 한두 건으로 만든 평균은 그 업체를
 * 잘못 규정하고, 본인도 그 숫자에 맞춰 이상하게 행동하게 된다.
 */
export function AccuracyCard({ accuracy }: { accuracy: ProviderEstimateAccuracy | null }) {
  if (!accuracy || accuracy.sampleCount === 0) return null;
  const deviation = accuracy.averageDeviation ?? 0;

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>내 개산 정확도</Text>
      {accuracy.sampleCount < 3 ? (
        <Text style={styles.value}>실적 {accuracy.sampleCount}건 — 아직 판단하기 이릅니다</Text>
      ) : (
        <Text style={styles.value}>
          개산 대비 확정 평균 {deviation > 0 ? '+' : ''}
          {Math.round(deviation * 100)}% · {accuracy.sampleCount}건
        </Text>
      )}
      <Text style={styles.hint}>
        소비자에게도 보이는 지표입니다. 확정에서 많이 올릴수록 다음 매칭이 어려워집니다.
      </Text>
    </Card>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  value: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginTop: spacing.xs / 2,
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 26,
    marginTop: spacing.xs,
  },
});
