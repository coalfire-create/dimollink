import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { theme } from '../theme';
import brandmark from '../../assets/brandmark.png';

/**
 * 게스트(로그인 없이 둘러보기) 화면.
 * 서비스 소개만 제공하고, 요청 등록·내 정보 등 실제 기능은 로그인/회원가입으로 유도한다.
 */
const STEPS: Array<{ icon: string; title: string; description: string }> = [
  { icon: '📝', title: '요청 등록', description: '철거·운반·처리 요청을 한 번에 올려요' },
  { icon: '🤝', title: '업체 매칭', description: '가까운 업체가 견적을 보내드려요' },
  { icon: '♻️', title: '올바로 자동 처리', description: '전자인계서 신고까지 알아서 처리해요' },
];

export function GuestHomeScreen({
  onLogin,
  onSignup,
}: {
  onLogin: () => void;
  onSignup: () => void;
}) {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInUp delay={40}>
          <View style={styles.heroSection}>
            <View style={styles.logoMark}>
              <Text style={styles.logoMarkText}>D</Text>
            </View>
            <Image
              source={brandmark}
              style={styles.brandmark}
              resizeMode="contain"
              accessibilityLabel="비움 로고"
            />
            <Text style={styles.appName}>비움</Text>
            <Text style={styles.slogan}>철거를 더 쉽고, 더 똑똑하게</Text>
            <View style={styles.pilotChip}>
              <Text style={styles.pilotChipText}>전국 · 건설폐기물</Text>
            </View>
          </View>
        </FadeInUp>

        {STEPS.map((step, i) => (
          <FadeInUp key={step.title} delay={180 + i * 90}>
            <View style={styles.stepCard}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
              <Text style={styles.stepIcon}>{step.icon}</Text>
            </View>
          </FadeInUp>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <View style={styles.actionsDivider} />
        <View style={styles.actionsInner}>
          <AppButton label="로그인" onPress={onLogin} />
          <View style={{ height: theme.spacing.sm }} />
          <AppButton label="회원가입" variant="outline" onPress={onSignup} />
        </View>
      </View>
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
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 64,
  },
  logoMarkText: {
    color: colors.background,
    fontSize: font.titleLarge,
    fontWeight: '900',
  },
  brandmark: {
    alignSelf: 'center',
    height: 80,
    width: 80,
  },
  appName: {
    color: colors.primary,
    fontSize: font.titleLarge + 4,
    fontWeight: '900',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  slogan: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  pilotChip: {
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pilotChipText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  stepCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.card,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    padding: spacing.md,
    shadowColor: '#0B1B3A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 4,
  },
  stepNumberBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 32,
  },
  stepNumber: {
    color: colors.background,
    fontSize: font.body,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  stepDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  stepIcon: {
    fontSize: font.titleLarge + 4,
    marginLeft: spacing.sm,
  },
  actions: {
    backgroundColor: colors.background,
  },
  actionsDivider: {
    backgroundColor: colors.border,
    height: 1,
  },
  actionsInner: {
    padding: spacing.md,
  },
});
