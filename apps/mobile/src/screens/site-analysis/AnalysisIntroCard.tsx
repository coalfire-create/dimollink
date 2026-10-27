import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

/**
 * 화면 상단 안내 — 이 화면이 무엇을 해 주는 곳인지.
 *
 * 사진 한 장으로 무엇이 나오는지 모르면 사용자는 촬영을 시작하지 않는다.
 * 그래서 결과물(석면 등 위험 자재·폐기물 종류·작업 주의사항)을 문장으로 먼저 적어 둔다.
 * 예전엔 "스마트 현장 분석 · 자동화 리포트" 배지와 기능 칩을 달았는데, 광고 문구처럼 읽혀 뺐다.
 */
export function AnalysisIntroCard({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
    lineHeight: 32,
  },
  description: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
});
