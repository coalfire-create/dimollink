import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../AppIcon';
import { FadeInUp } from '../motion';
import { theme } from '../../theme';
import type { StepItem } from './guideSteps';

/**
 * 가이드 한 단계 — 아이콘 + 제목 + 요약 + 체크리스트 + 팁.
 *
 * 단계마다 "무엇을 하는지(요약)"와 "어떻게 하는지(체크리스트)"를 나눠 둔다.
 * 처음 온 사용자는 요약만 읽고 넘어가고, 막힌 사용자는 체크리스트를 본다.
 */
export function GuideStepCard({ step }: { step: StepItem }) {
  return (
    <FadeInUp key={step.step} delay={30} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <AppIcon name={step.icon} size={28} color={colors.primary} />
        </View>
        <Text style={styles.stepLabel}>{step.step}단계</Text>
      </View>

      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.summary}>{step.summary}</Text>

      <View style={styles.detailsList}>
        {step.details.map((detail, i) => (
          <View key={detail} style={styles.detailRow}>
            <Text style={styles.detailIndex}>{i + 1}</Text>
            <Text style={styles.detailText}>{detail}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tipBox}>
        <Text style={styles.tipTitle}>참고</Text>
        <Text style={styles.tipText}>{step.tip}</Text>
      </View>
    </FadeInUp>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  head: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  iconTile: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: theme.radius.button,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 48,
  },
  stepLabel: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  summary: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginBottom: spacing.md,
  },
  detailsList: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginBottom: spacing.md,
    paddingTop: spacing.sm,
  },
  detailRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  detailIndex: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '800',
    lineHeight: 28,
    width: spacing.md,
  },
  detailText: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    lineHeight: 28,
  },
  tipBox: {
    backgroundColor: colors.surface,
    borderRadius: theme.radius.button,
    padding: spacing.sm,
  },
  tipTitle: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  tipText: {
    color: colors.text,
    fontSize: font.body,
    lineHeight: 28,
  },
});
