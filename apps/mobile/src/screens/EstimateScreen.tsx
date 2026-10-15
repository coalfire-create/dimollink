import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../components/AppIcon';
import { AppButton, ErrorBanner } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { ScreenHeader } from '../navigation';
import { AreaStep } from './estimate/AreaStep';
import { EstimateResultCard } from './estimate/EstimateResultCard';
import { StructureStep } from './estimate/StructureStep';
import { useVolumeEstimate } from './estimate/useVolumeEstimate';
import { theme } from '../theme';

/**
 * 폐기물 양 미리 계산 — 면적·구조만으로 예상 물량과 차량 대수를 알려준다.
 *
 * 요청을 넣기 전에 "얼마나 나올지" 감을 잡는 자리다. 계산 규칙은
 * [[useVolumeEstimate]] 에, 각 단계와 결과 카드는 `screens/estimate/` 에 있다.
 */
export function EstimateScreen() {
  const estimate = useVolumeEstimate();
  const scrollRef = useRef<ScrollView>(null);
  // 결과는 버튼 아래에 붙어 화면 밖에 뜨기 쉽다 — 나오면 그 자리로 내려 준다.
  useEffect(() => {
    if (estimate.result) scrollRef.current?.scrollToEnd({ animated: true });
  }, [estimate.result]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="폐기물 양 미리 계산" canGoBack />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <FadeInUp delay={20}>
          <View style={styles.introCard}>
            <AppIcon name="sparkles" size={22} color={colors.primary} />
            <Text style={styles.introText}>
              면적과 구조만 입력하면 예상 폐기물 양과{'\n'}필요한 운반 차량 대수를 알려드려요.
            </Text>
          </View>
        </FadeInUp>

        <FadeInUp delay={60}>
          <AreaStep estimate={estimate} />
        </FadeInUp>

        <FadeInUp delay={100}>
          <StructureStep estimate={estimate} />
        </FadeInUp>

        <ErrorBanner message={estimate.error} />

        <AppButton
          label="계산하기"
          onPress={estimate.calculate}
          loading={estimate.loading}
          disabled={!estimate.canCalculate}
        />
        {estimate.inputWarning ? (
          <Text style={styles.inputWarning}>{estimate.inputWarning}</Text>
        ) : null}

        {estimate.result ? (
          <FadeInUp>
            <EstimateResultCard
              result={estimate.result}
              structure={estimate.structure}
              areaNum={estimate.areaNum}
              floorsNum={estimate.floorsNum}
            />
          </FadeInUp>
        ) : null}
      </ScrollView>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  introCard: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  introText: {
    color: colors.text,
    flex: 1,
    fontSize: font.body,
    fontWeight: '600',
    lineHeight: font.body + 8,
    marginLeft: spacing.sm,
  },
  inputWarning: {
    color: colors.error,
    fontSize: font.caption,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
