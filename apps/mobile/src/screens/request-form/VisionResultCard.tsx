import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DimolVisionSummary } from '@dimol/shared';
import { IconTile } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 현장 사진 분석 결과 카드 — 요약 한 줄 + 위험 요인 + 감지 소재.
 *
 * 신뢰도를 함께 적는 이유: 사진이 흐리거나 부위가 빠지면 분석이 흔들리는데,
 * 결과만 단정적으로 보여주면 사용자가 그대로 믿고 현장에서 어긋난다.
 * 값은 서버의 영문 코드(HIGH/MEDIUM/LOW)라 화면에서는 말로 바꿔 보여준다.
 */
const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: '높음',
  MEDIUM: '보통',
  NORMAL: '보통',
  LOW: '낮음',
};

export function VisionResultCard({ vision }: { vision: DimolVisionSummary }) {
  const confidence = CONFIDENCE_LABELS[vision.confidence ?? ''] ?? '보통';
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <IconTile icon="sparkles" size="sm" style={styles.headerIcon} />
        <Text style={styles.title}>사진 분석 결과</Text>
        <View style={styles.confidence}>
          <Text style={styles.confidenceText}>신뢰도 {confidence}</Text>
        </View>
      </View>
      {vision.summary ? <Text style={styles.summary}>{vision.summary}</Text> : null}
      {vision.hazards && vision.hazards.length > 0 ? (
        <View style={styles.hazardBox}>
          <Text style={styles.hazardTitle}>주의가 필요한 위험 요인</Text>
          {vision.hazards.map((hazard) => (
            <Text key={hazard} style={styles.hazardItem}>
              · {hazard}
            </Text>
          ))}
        </View>
      ) : null}
      {vision.materials && vision.materials.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>사진에서 찾은 주요 소재</Text>
          <View style={styles.chips}>
            {vision.materials.map((m) => (
              <View key={m} style={styles.chip}>
                <Text style={styles.chipText}>{m}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  headerIcon: {
    marginRight: spacing.xs,
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  confidence: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  confidenceText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  summary: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.sm,
  },
  hazardBox: {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: radius.button,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  hazardTitle: {
    color: theme.colors.warning,
    fontSize: font.body,
    fontWeight: '800',
  },
  hazardItem: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 26,
    marginTop: spacing.xs / 2,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  chipText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
});
