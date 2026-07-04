import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { PILOT } from '@dimol/shared';
import { AppButton } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { theme } from '../theme';
import brandmark from '../../assets/brandmark.png';

/**
 * 진입 게이트 — 앱을 열면 가장 먼저 보이는 화면.
 * 로그인 / 회원가입으로만 서비스에 들어갈 수 있고, 둘러보기(게스트)는 별도 경로.
 */
export function WelcomeScreen({
  onLogin,
  onSignup,
  onGuest,
  onAdmin,
}: {
  onLogin: () => void;
  onSignup: () => void;
  onGuest: () => void;
  onAdmin?: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <FadeInUp delay={40}>
          <Image
            source={brandmark}
            style={styles.brandmark}
            resizeMode="contain"
            accessibilityLabel="비움 로고"
          />
        </FadeInUp>
        <FadeInUp delay={160}>
          <Text style={styles.appName}>비움</Text>
        </FadeInUp>
        <FadeInUp delay={260}>
          <Text style={styles.slogan}>철거를 더 쉽고, 더 똑똑하게</Text>
        </FadeInUp>
        <FadeInUp delay={360}>
          <View style={styles.pilotChip}>
            <Text style={styles.pilotChipText}>{PILOT.region} · 건설폐기물</Text>
          </View>
        </FadeInUp>
      </View>

      <FadeInUp delay={460} style={styles.actions}>
        <AppButton label="로그인" onPress={onLogin} />
        <View style={{ height: theme.spacing.sm }} />
        <AppButton label="회원가입" variant="outline" onPress={onSignup} />
        <View style={{ height: theme.spacing.sm }} />
        <Text accessibilityRole="button" onPress={onGuest} style={styles.guestLink}>
          로그인 없이 둘러보기
        </Text>
        {onAdmin ? (
          <Text accessibilityRole="button" onPress={onAdmin} style={styles.adminLink}>
            관리자
          </Text>
        ) : null}
      </FadeInUp>
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  hero: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  brandmark: {
    height: 112,
    marginBottom: spacing.sm,
    width: 112,
  },
  appName: {
    color: colors.primary,
    fontSize: font.titleLarge + 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  slogan: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '600',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  pilotChip: {
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pilotChipText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
  },
  actions: {
    paddingBottom: spacing.lg,
  },
  guestLink: {
    color: colors.textMuted,
    fontSize: font.body,
    fontWeight: '600',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    textAlign: 'center',
  },
  adminLink: {
    color: colors.textMuted,
    fontSize: font.caption,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
