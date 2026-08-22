import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/ui';
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeInUp delay={40}>
          <View style={styles.heroSection}>
            <Image
              source={brandmark}
              style={styles.brandmark}
              resizeMode="contain"
              accessibilityLabel="디몰링크 로고"
            />
            <Text style={styles.appName}>디몰링크</Text>
            <Text style={styles.slogan}>철거를 더 쉽고, 더 똑똑하게</Text>
            <View style={styles.pilotChip}>
              <Text style={styles.pilotChipText}>전국 · 건설폐기물</Text>
            </View>
          </View>
        </FadeInUp>

        <View style={styles.stepsContainer}>
          {STEPS.map((step, i) => (
            <FadeInUp key={step.title} delay={140 + i * 80}>
              <View style={styles.stepCard}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumber}>{i + 1}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
                <View style={styles.stepIconWrap}>
                  <Text style={styles.stepIcon}>{step.icon}</Text>
                </View>
              </View>
            </FadeInUp>
          ))}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <View style={styles.actionsInner}>
          <AppButton label="로그인" onPress={onLogin} />
          <View style={{ height: theme.spacing.xs + 4 }} />
          <AppButton label="회원가입" variant="outline" onPress={onSignup} />
        </View>
      </View>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  brandmark: {
    alignSelf: 'center',
    height: 88,
    width: 88,
    marginBottom: spacing.xs,
  },
  appName: {
    color: colors.primary,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: spacing.xs / 2,
    textAlign: 'center',
  },
  slogan: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: spacing.xs / 2,
    textAlign: 'center',
  },
  pilotChip: {
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#D4E2FA',
    borderRadius: radius.pill,
    borderWidth: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  pilotChipText: {
    color: colors.primary,
    fontSize: font.body - 2,
    fontWeight: '700',
  },
  stepsContainer: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stepCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    padding: spacing.md - 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  stepNumberBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 34,
  },
  stepNumber: {
    color: '#FFFFFF',
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
    marginBottom: 2,
  },
  stepDescription: {
    color: colors.textMuted,
    fontSize: font.body - 1,
    lineHeight: 22,
  },
  stepIconWrap: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    marginLeft: spacing.xs,
    width: 44,
  },
  stepIcon: {
    fontSize: 22,
  },
  actions: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E2E8F0',
    borderTopWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  actionsInner: {
    padding: spacing.md,
  },
});
