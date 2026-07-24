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
        </FadeInUp>

        {STEPS.map((step, i) => (
          <FadeInUp key={step.title} delay={180 + i * 90}>
            <Card>
              <Text style={styles.stepTitle}>
                {step.icon} {step.title}
              </Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </Card>
          </FadeInUp>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <AppButton label="로그인" onPress={onLogin} />
        <View style={{ height: theme.spacing.sm }} />
        <AppButton label="회원가입" variant="outline" onPress={onSignup} />
      </View>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  brandmark: {
    alignSelf: 'center',
    height: 80,
    width: 80,
  },
  appName: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  slogan: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
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
  actions: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: spacing.md,
  },
});
