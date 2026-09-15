import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SiteAnalysis } from '@dimol/shared';
import { AppIcon } from '../../components/AppIcon';
import { Card } from '../../components/ui';
import { FadeInUp } from '../../components/motion';
import { theme } from '../../theme';
import { MaterialRow } from './MaterialRow';

/**
 * 진단 결과 리포트 — 요약 · 구성 소재 · 공정 절차 · 위험 요소 · 확인하지 못한 부분.
 *
 * 마지막 두 블록이 이 리포트의 핵심이다. 위험 요소는 사람이 다치는 항목이고,
 * "확인하지 못한 부분"은 근거 없이 추정하는 대신 모른다고 말하는 자리다 —
 * 빠진 걸 아는 채로 현장에 가는 편이, 틀린 걸 믿고 가는 것보다 안전하다.
 */
export function AnalysisReport({ result }: { result: SiteAnalysis }) {
  return (
    <View style={styles.wrap}>
      <FadeInUp delay={40}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.rowCenter}>
              <AppIcon name="document" size={20} color={colors.primary} />
              <Text style={styles.summaryLabel}>현장 분석 진단서</Text>
            </View>
            <View style={styles.methodChip}>
              <Text style={styles.methodChipText}>
                {result.method === 'AI_VISION' ? '자동 분석' : '시연용 샘플'}
              </Text>
            </View>
          </View>
          <Text style={styles.summaryText}>{result.summary}</Text>
        </View>
      </FadeInUp>

      <Text style={styles.sectionTitle}>구성 소재 ({result.materials.length})</Text>
      <FadeInUp delay={100}>
        <Card>
          {result.materials.map((material, index) => (
            <View key={`${material.name}-${index}`}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <MaterialRow material={material} />
            </View>
          ))}
        </Card>
      </FadeInUp>

      <Text style={styles.sectionTitle}>권장 철거 공정 절차</Text>
      {result.demolitionSteps.map((step, index) => (
        <FadeInUp key={step.order} delay={140 + index * 60}>
          <Card style={styles.stepCard}>
            <View style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{step.order}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.description}</Text>
                {step.caution ? (
                  <View style={styles.cautionBox}>
                    <AppIcon name="alert" size={14} color={colors.error} />
                    <Text style={styles.stepCaution}>주의사항: {step.caution}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        </FadeInUp>
      ))}

      {result.hazards.length > 0 ? (
        <FadeInUp>
          <View style={styles.hazardCard}>
            <View style={[styles.rowCenter, styles.hazardHeader]}>
              <AppIcon name="alert" size={20} color={colors.error} />
              <Text style={styles.hazardTitle}>현장 안전 위험 요소 경고</Text>
            </View>
            {result.hazards.map((hazard) => (
              <Text key={hazard} style={styles.hazardItem}>
                • {hazard}
              </Text>
            ))}
          </View>
        </FadeInUp>
      ) : null}

      {result.coverageWarnings.length > 0 ? (
        <FadeInUp>
          <View style={styles.coverageCard}>
            <Text style={styles.coverageTitle}>확인하지 못한 부분</Text>
            {result.coverageWarnings.map((warning) => (
              <Text key={warning} style={styles.coverageItem}>
                • {warning}
              </Text>
            ))}
          </View>
        </FadeInUp>
      ) : null}

      <Text style={styles.disclaimer}>{result.disclaimer}</Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.spacing.md,
  },
  rowCenter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  hazardHeader: {
    marginBottom: theme.spacing.xs,
  },
  stepBody: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  methodChip: {
    backgroundColor: colors.background,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  methodChipText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  summaryText: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '600',
    marginTop: spacing.sm,
    lineHeight: 26,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.title - 4,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: spacing.xs,
  },
  stepCard: {
    marginBottom: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
  },
  stepNum: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 32,
  },
  stepNumText: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '800',
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  stepDesc: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
    lineHeight: 24,
  },
  cautionBox: {
    backgroundColor: colors.errorSoft,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.errorSoft,
  },
  stepCaution: {
    color: colors.error,
    fontSize: font.caption,
    fontWeight: '600',
  },
  hazardCard: {
    backgroundColor: colors.errorSoft,
    borderRadius: radius.card,
    borderColor: colors.errorSoft,
    borderWidth: 1.5,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  hazardTitle: {
    color: colors.error,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  hazardItem: {
    color: colors.error,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
    fontWeight: '600',
  },
  coverageCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderColor: colors.border,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  coverageTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  coverageItem: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  disclaimer: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
