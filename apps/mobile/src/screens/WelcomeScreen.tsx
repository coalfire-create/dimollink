import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PILOT } from '@dimol/shared';
import { AppButton } from '../components/ui';
import { theme } from '../theme';

/**
 * 진입 게이트 — 앱을 열면 가장 먼저 보이는 화면.
 * 로그인 / 회원가입으로만 서비스에 들어갈 수 있고, 둘러보기(게스트)는 별도 경로.
 */
export function WelcomeScreen({
  onLogin,
  onSignup,
  onGuest,
}: {
  onLogin: () => void;
  onSignup: () => void;
  onGuest: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.appName}>디몰링크</Text>
        <Text style={styles.tagline}>철거부터 폐기물 처리까지,{'\n'}한 번에 연결해 드려요</Text>
        <Text style={styles.pilotNote}>지금은 {PILOT.region} 지역 건설폐기물만 서비스해요</Text>
      </View>

      <View style={styles.actions}>
        <AppButton label="로그인" onPress={onLogin} />
        <View style={{ height: theme.spacing.sm }} />
        <AppButton label="회원가입" variant="outline" onPress={onSignup} />
        <View style={{ height: theme.spacing.md }} />
        <AppButton label="로그인 없이 둘러보기" variant="outline" onPress={onGuest} />
      </View>
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
  appName: {
    color: colors.primary,
    fontSize: font.titleLarge + 8,
    fontWeight: '800',
  },
  tagline: {
    color: colors.text,
    fontSize: font.bodyLarge,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  pilotNote: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  actions: {
    paddingBottom: spacing.lg,
  },
});
