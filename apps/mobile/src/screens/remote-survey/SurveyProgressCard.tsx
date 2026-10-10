import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { computeSurveyCompleteness, type RemoteSurvey } from '@dimol/shared';
import { Card } from '../../components/ui';
import { theme } from '../../theme';

/**
 * 진행률 — "꼭 필요한 것 n개 중 m개 했어요" + 막대.
 * 숫자는 서버 제출 판정과 같은 함수([[remote-survey]] computeSurveyCompleteness)로 낸다.
 */
export function SurveyProgressCard({ survey }: { survey: RemoteSurvey }) {
  const { ratio, doneRequired, totalRequired } = computeSurveyCompleteness(survey);
  const submitted = survey.status === 'SUBMITTED';
  return (
    <Card>
      <Text style={styles.title}>
        {submitted
          ? '✓ 업체에 보냈어요'
          : `꼭 필요한 것 ${totalRequired}개 중 ${doneRequired}개 했어요`}
      </Text>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: totalRequired, now: doneRequired }}
      >
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
      <Text style={styles.body}>
        {submitted
          ? '업체가 사진을 더 부탁하면 알림이 와요. 이 화면에서 찍어 보내 주세요.'
          : '업체가 집에 오지 않아도 견적을 낼 수 있게, 안내대로 찍어 주세요.'}
      </Text>
    </Card>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  track: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    height: spacing.sm,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.primary,
    height: '100%',
  },
  body: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
  },
});
