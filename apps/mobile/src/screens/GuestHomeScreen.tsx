import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PILOT } from '@dimol/shared';
import { AppButton, Card } from '../components/ui';
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
        <Image
          source={brandmark}
          style={styles.brandmark}
          resizeMode="contain"
          accessibilityLabel="비움 로고"
        />
        <Text style={styles.appName}>비움</Text>
        <Text style={styles.slogan}>철거를 더 쉽고, 더 똑똑하게</Text>
        <Text style={styles.tagline}>둘러보기 모드예요. 로그인하면 요청을 등록할 수 있어요.</Text>
        <Text style={styles.pilotNote}>지금은 {PILOT.region} 지역 건설폐기물만 서비스해요</Text>

        {STEPS.map((step) => (
          <Card key={step.title}>
            <Text style={styles.stepTitle}>
              {step.icon} {step.title}
            </Text>
            <Text style={styles.stepDescription}>{step.description}</Text>
          </Card>
        ))}

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            요청 등록·견적 확인·알림은 로그인 후 이용할 수 있어요.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <AppButton label="로그인" onPress={onLogin} />
        <View style={{ height: theme.spacing.sm }} />
        <AppButton label="회원가입" variant="outline" onPress={onSignup} />
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
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  tagline: {
    color: colors.text,
    fontSize: font.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  pilotNote: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    textAlign: 'center',
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
  notice: {
    backgroundColor: '#E7EFFC',
    borderRadius: radius.card,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  noticeText: {
    color: colors.text,
    fontSize: font.body,
  },
  actions: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: spacing.md,
  },
});
