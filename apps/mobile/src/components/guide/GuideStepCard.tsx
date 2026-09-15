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
      <View style={styles.iconWrapper}>
        <View style={styles.iconCircle}>
          <AppIcon name={step.icon} size={48} color={colors.primary} filled />
        </View>
      </View>

      <Text style={styles.title}>
        <Text style={styles.numberText}>{step.step}단계. </Text>
        {step.title}
      </Text>
      <Text style={styles.summary}>{step.summary}</Text>

      <View style={styles.detailsList}>
        {step.details.map((detail) => (
          <View key={detail} style={styles.detailRow}>
            <View style={styles.detailBullet}>
              <Text style={styles.detailBulletText}>✓</Text>
            </View>
            <Text style={styles.detailText}>{detail}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tipBox}>
        <View style={styles.tipTitleRow}>
          <Text style={styles.tipEmoji}>💡</Text>
          <Text style={styles.tipTitle}>알아두면 유용한 팁</Text>
        </View>
        <Text style={styles.tipText}>{step.tip}</Text>
      </View>
    </FadeInUp>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: spacing.lg,
    alignItems: 'center',
    shadowColor: theme.colors.cameraBackground,
    shadowOpacity: 0.04,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    marginBottom: spacing.md,
  },
  iconWrapper: {
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(59,130,246,0.3)',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  numberText: {
    color: colors.primary,
  },
  summary: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  detailsList: {
    width: '100%',
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  detailBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: spacing.xs / 2,
  },
  detailBulletText: {
    color: colors.background,
    fontSize: theme.glyph.inline,
    fontWeight: '900',
  },
  detailText: {
    flex: 1,
    color: colors.text,
    fontSize: font.bodyLarge,
    lineHeight: 24,
    fontWeight: '600',
  },
  tipBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    padding: spacing.lg,
    width: '100%',
  },
  tipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipEmoji: {
    fontSize: 18,
    marginRight: spacing.xs,
  },
  tipTitle: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  tipText: {
    color: colors.primaryDark,
    fontSize: font.bodyLarge,
    lineHeight: 24,
    fontWeight: '700',
  },
});
