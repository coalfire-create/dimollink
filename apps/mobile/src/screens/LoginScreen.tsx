import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AuthSession, SocialProvider } from '@dimol/shared';
import { ApiError, requestOtp, verifyOtp } from '../api/client';
import { startSocialLogin } from '../lib/social-auth';
import { AppButton, ErrorBanner, Field } from '../components/ui';
import { theme } from '../theme';

function isPhoneLike(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10;
}

// 소셜 버튼 브랜드 스펙
const SOCIAL_CONFIG: Record<
  SocialProvider,
  { label: string; bg: string; fg: string; borderColor?: string; icon: string }
> = {
  kakao: {
    label: '카카오로 시작하기',
    bg: '#FEE500',
    fg: '#191919',
    icon: '💬',
  },
  naver: {
    label: '네이버로 시작하기',
    bg: '#03C75A',
    fg: '#FFFFFF',
    icon: 'N',
  },
  google: {
    label: 'Google로 시작하기',
    bg: '#FFFFFF',
    fg: '#1F1F1F',
    borderColor: '#E0E0E0',
    icon: 'G',
  },
};

function SocialButton({
  provider,
  onPress,
  loading,
}: {
  provider: SocialProvider;
  onPress: () => void;
  loading: boolean;
}) {
  const cfg = SOCIAL_CONFIG[provider];
  const isGoogle = provider === 'google';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cfg.label}
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        s.socialBtn,
        {
          backgroundColor: cfg.bg,
          borderWidth: isGoogle ? 1 : 0,
          borderColor: cfg.borderColor ?? 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={cfg.fg} size="small" />
      ) : (
        <>
          <View
            style={[
              s.socialIconWrap,
              provider === 'naver' && { backgroundColor: '#FFFFFF' },
              provider === 'google' && { backgroundColor: '#FFFFFF' },
            ]}
          >
            <Text
              style={[
                s.socialIcon,
                provider === 'naver' && { color: '#03C75A', fontWeight: '900' },
                provider === 'google' && { color: '#4285F4', fontWeight: '900' },
                provider === 'kakao' && { fontSize: 18 },
              ]}
            >
              {cfg.icon}
            </Text>
          </View>
          <Text style={[s.socialLabel, { color: cfg.fg }]}>{cfg.label}</Text>
          <View style={s.socialIconWrap} />
        </>
      )}
    </Pressable>
  );
}

export function LoginScreen({
  onSuccess,
  onSignup,
  onBack,
}: {
  onSuccess: (session: AuthSession) => void;
  onSignup: () => void;
  onBack: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeSocial, setActiveSocial] = useState<SocialProvider | null>(null);

  async function sendCode() {
    setError(null);
    setNotice(null);
    if (!isPhoneLike(phone)) {
      setError('휴대폰번호를 정확히 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await requestOtp(phone.trim());
      setCodeSent(true);
      setNotice('인증코드를 발송했어요. 문자로 받은 6자리를 입력해 주세요.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '인증코드 발송에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function socialLogin(provider: SocialProvider) {
    setError(null);
    setNotice(null);
    setActiveSocial(provider);
    try {
      await startSocialLogin(provider);
      setNotice(`${SOCIAL_CONFIG[provider].label.split('로')[0]}(으)로 이동합니다. 인증 후 앱으로 돌아와요.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '소셜 로그인을 시작하지 못했어요.');
    } finally {
      setActiveSocial(null);
    }
  }

  async function submit() {
    setError(null);
    if (code.trim().length === 0) {
      setError('인증코드를 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const result = await verifyOtp(phone.trim(), code.trim());
      if (result.session) {
        onSuccess(result.session);
        return;
      }
      setNotice('가입되지 않은 번호예요. 회원가입을 진행해 주세요.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const { colors, font, spacing } = theme;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* 상단 내비 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기"
        onPress={onBack}
        style={s.back}
      >
        <Text style={[s.backLabel, { color: colors.primary, fontSize: font.bodyLarge }]}>
          ‹ 뒤로
        </Text>
      </Pressable>

      {/* 브랜드 헤더 */}
      <View style={s.header}>
        <View style={[s.logoMark, { backgroundColor: colors.primary }]}>
          <Text style={s.logoText}>D</Text>
        </View>
        <Text style={[s.title, { color: colors.text, fontSize: font.titleLarge }]}>로그인</Text>
        <Text style={[s.subtitle, { color: colors.textMuted, fontSize: font.body }]}>
          가입하신 휴대폰번호로 인증해 주세요
        </Text>
      </View>

      {/* 소셜 로그인 */}
      <View style={s.socialSection}>
        {(['kakao', 'google', 'naver'] as SocialProvider[]).map((provider) => (
          <SocialButton
            key={provider}
            provider={provider}
            onPress={() => void socialLogin(provider)}
            loading={activeSocial === provider}
          />
        ))}
      </View>

      {/* 구분선 */}
      <View style={s.dividerRow}>
        <View style={[s.divider, { backgroundColor: colors.border }]} />
        <Text style={[s.dividerText, { color: colors.textMuted, fontSize: font.body }]}>
          휴대폰 번호로 로그인
        </Text>
        <View style={[s.divider, { backgroundColor: colors.border }]} />
      </View>

      {/* OTP 폼 */}
      <View style={s.otpSection}>
        <Field
          label="휴대폰번호"
          value={phone}
          onChangeText={setPhone}
          placeholder="010-0000-0000"
          keyboardType="phone-pad"
          editable={!codeSent}
          autoFocus={false}
        />
        <AppButton
          label={codeSent ? '인증코드 다시 받기' : '인증코드 받기'}
          variant={codeSent ? 'outline' : 'primary'}
          onPress={sendCode}
          loading={busy && !codeSent}
        />

        {codeSent && (
          <View style={{ marginTop: spacing.md }}>
            <Field
              label="인증코드"
              value={code}
              onChangeText={setCode}
              placeholder="6자리 숫자"
              keyboardType="number-pad"
              maxLength={6}
            />
            <AppButton label="로그인" onPress={submit} loading={busy} />
          </View>
        )}
      </View>

      {notice ? (
        <Text style={[s.notice, { color: colors.primary, fontSize: font.body }]}>{notice}</Text>
      ) : null}
      <ErrorBanner message={error} />

      {/* 회원가입 */}
      <View style={s.signupRow}>
        <Text style={[s.helper, { color: colors.textMuted, fontSize: font.body }]}>
          아직 계정이 없으신가요?
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onSignup}
          style={s.signupLink}
        >
          <Text style={[s.signupLinkText, { color: colors.primary, fontSize: font.body }]}>
            회원가입
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    paddingBottom: 48,
  },
  back: {
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    minHeight: theme.touch.minButtonHeight,
    alignSelf: 'flex-start',
    paddingRight: theme.spacing.sm,
  },
  backLabel: {
    fontWeight: '700',
  },
  // 헤더
  header: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    ...theme.shadow.primary,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  title: {
    fontWeight: '800',
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
  },
  // 소셜 버튼
  socialSection: {
    gap: 12,
    marginBottom: theme.spacing.md,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: theme.radius.button,
    height: theme.touch.primaryButtonHeight,
    paddingHorizontal: theme.spacing.sm,
    ...theme.shadow.card,
  },
  socialIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIcon: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  socialLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.bodyLarge,
    fontWeight: '700',
  },
  // 구분선
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: theme.spacing.sm,
    fontWeight: '500',
  },
  // OTP
  otpSection: {
    marginBottom: theme.spacing.sm,
  },
  notice: {
    fontWeight: '600',
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  // 회원가입
  signupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  helper: {
    fontWeight: '400',
  },
  signupLink: {
    minHeight: theme.touch.minButtonHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  signupLinkText: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
