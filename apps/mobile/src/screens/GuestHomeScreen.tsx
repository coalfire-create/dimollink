import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon, type IconName } from '../components/AppIcon';
import { AppButton } from '../components/ui';
import { CompanyInfoFooter } from '../components/CompanyInfoFooter';
import { FadeInUp } from '../components/motion';
import { ProductShowcase } from './store/ProductShowcase';
import { theme } from '../theme';
import brandmark from '../../assets/brandmark.png';

/**
 * 게스트(로그인 없이 둘러보기) 화면.
 * 서비스 소개만 제공하고, 요청 등록·내 정보 등 실제 기능은 로그인/회원가입으로 유도한다.
 * 판매 상품과 사업자 정보(고객센터 전화)도 여기서 볼 수 있다 — PG 심사 요건.
 */
const STEPS: Array<{ icon: IconName; title: string; description: string }> = [
  { icon: 'document', title: '요청 등록', description: '철거·운반·처리 요청을 한 번에 올려요' },
  { icon: 'tools', title: '업체 매칭', description: '가까운 업체가 견적을 보내드려요' },
  {
    icon: 'recycle',
    title: '올바로 자동 처리',
    description: '전자인계서 신고까지 알아서 처리해요',
  },
];

export function GuestHomeScreen({
  onLogin,
  onSignup,
  onBuy,
}: {
  onLogin: () => void;
  onSignup: () => void;
  /** 상품 "구매하기" — 로그인 후 스토어로 이어진다. */
  onBuy: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      {/* 헤더가 없는 화면이라 콘텐츠가 그대로 상태바·홈 인디케이터에 붙는다. */}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + theme.spacing.md,
            paddingBottom: insets.bottom + theme.spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <FadeInUp delay={40}>
          <View style={styles.heroSection}>
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
                  <AppIcon name={step.icon} size={24} color={theme.colors.primary} />
                </View>
              </View>
            </FadeInUp>
          ))}
        </View>

        <View style={styles.publicInfo}>
          <ProductShowcase onBuy={onBuy} />
          <CompanyInfoFooter />
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
    backgroundColor: colors.surface,
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    // 세로 여백은 안전영역에 맞춰 런타임에 정한다.
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
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pilotChipText: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  publicInfo: {
    marginTop: spacing.lg,
  },
  stepsContainer: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stepCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    padding: spacing.md - 4,
    shadowColor: colors.text,
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
    marginBottom: spacing.xs / 2,
  },
  stepDescription: {
    color: colors.textMuted,
    fontSize: font.caption,
    lineHeight: 22,
  },
  stepIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    marginLeft: spacing.xs,
    width: 48,
  },
  actions: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    elevation: 4,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  actionsInner: {
    padding: spacing.md,
  },
});
