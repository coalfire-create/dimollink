import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DimolVisionSummary } from '@dimol/shared';
import { theme } from '../../theme';

/**
 * 현장 사진 분석 결과 카드 — 요약 한 줄 + 위험 요인 + 감지 소재.
 *
 * 신뢰도를 함께 적는 이유: 사진이 흐리거나 부위가 빠지면 분석이 흔들리는데,
 * 결과만 단정적으로 보여주면 사용자가 그대로 믿고 현장에서 어긋난다.
 */
export function VisionResultCard({ vision }: { vision: DimolVisionSummary }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.badge}>현장 분석</Text>
        <Text style={styles.confidence}>신뢰도: {vision.confidence ?? 'NORMAL'}</Text>
      </View>
      <Text style={styles.summary}>&quot;{vision.summary}&quot;</Text>
      {vision.hazards && vision.hazards.length > 0 ? (
        <View style={styles.hazardBox}>
          <Text style={styles.hazardTitle}>주의가 필요한 위험 요인</Text>
          {vision.hazards.map((hazard) => (
            <Text key={hazard} style={styles.hazardItem}>
              • {hazard}
            </Text>
          ))}
        </View>
      ) : null}
      {vision.materials && vision.materials.length > 0 ? (
        <View style={styles.materialBox}>
          <Text style={styles.materialTitle}>사진에서 찾은 주요 소재</Text>
          <Text style={styles.materialText}>{vision.materials.join(', ')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  badge: {
    backgroundColor: colors.primary,
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '800',
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.xs / 2,
    borderRadius: 4,
  },
  confidence: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
  summary: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginVertical: spacing.xs,
  },
  hazardBox: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.button,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  hazardTitle: {
    color: colors.error,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  hazardItem: {
    color: colors.error,
    fontSize: font.caption,
  },
  materialBox: {
    marginTop: spacing.xs,
  },
  materialTitle: {
    color: colors.text,
    fontSize: font.caption,
    fontWeight: '700',
  },
  materialText: {
    color: colors.textMuted,
    fontSize: font.caption,
  },
});
