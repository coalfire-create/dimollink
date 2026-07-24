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
import { FadeInUp, PressableScale } from '../components/motion';
import { theme } from '../theme';

function isPhoneLike(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10;
}

// 소셜 버튼 브랜드 스펙
const SOCIAL_CONFIG: Record<
  SocialProvider,
  { label: string; bg: string; fg: string; borderColor?: string; icon: string; badgeText?: string }
> = {
  kakao: {
    label: '카카오로 시작하기',
    bg: '#FEE500',
    fg: '#191919',
    icon: '💬',
    badgeText: '빠른 로그인',
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
    borderColor: '#E2E8F0',
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={cfg.label}
      onPress={onPress}
      disabled={loading}
      style={[
        s.socialBtn,
        {
          backgroundColor: cfg.bg,
          borderWidth: isGoogle ? 1.5 : 0,
          borderColor: cfg.borderColor ?? 'transparent',
          opacity: loading ? 0.7 : 1,
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
          {cfg.badgeText ? (
            <View style={s.socialBadge}>
              <Text style={s.socialBadgeText}>{cfg.badgeText}</Text>
            </View>
          ) : (
            <View style={s.socialIconWrap} />
          )}
        </>
      )}
    </PressableScale>
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
      setNotice('인증코드를 발송했습니다. 문자로 받은 6자리를 입력해 주세요.');
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
      {/* 상단 뒤로가기 버튼 */}
      <FadeInUp delay={20}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          onPress={onBack}
          style={s.backBtn}
        >
          <Text style={[s.backLabel, { color: colors.primary, fontSize: font.bodyLarge }]}>
            ‹ 뒤로
          </Text>
        </Pressable>
      </FadeInUp>

      {/* 브랜드 헤더 */}
      <FadeInUp delay={60}>
        <View style={s.header}>
          <View style={[s.logoMark, { backgroundColor: colors.primary }]}>
            <Text style={s.logoText}>D</Text>
          </View>
          <Text style={[s.title, { color: colors.text, fontSize: font.titleLarge }]}>
            반가워요! 👋{'\n'}비움에 로그인하세요
          </Text>
          <Text style={[s.subtitle, { color: colors.textMuted, fontSize: font.body }]}>
            철거·운반·처리장 매칭 및 전자인계서 서비스
          </Text>
        </View>
      </FadeInUp>

      {/* 소셜 로그인 섹션 */}
      <FadeInUp delay={120}>
        <View style={s.socialSection}>
          {(['kakao', 'naver', 'google'] as SocialProvider[]).map((provider) => (
            <SocialButton
              key={provider}
              provider={provider}
              onPress={() => void socialLogin(provider)}
              loading={activeSocial === provider}
            />
          ))}
        </View>
      </FadeInUp>

      {/* 구분선 */}
      <FadeInUp delay={180}>
        <View style={s.dividerRow}>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Text style={[s.dividerText, { color: colors.textMuted, fontSize: font.body }]}>
            또는 휴대폰 번호로 로그인
          </Text>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
        </View>
      </FadeInUp>

      {/* OTP 로그인 폼 카드 */}
      <FadeInUp delay={240}>
        <View style={s.cardContainer}>
          <Field
            label="휴대폰번호"
            value={phone}
            onChangeText={setPhone}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            editable={!codeSent}
            autoFocus={false}
            hint={codeSent ? '번호 수정 시 인증코드를 다시 요청해 주세요.' : '등록하신 휴대폰번호를 입력해 주세요.'}
          />
          <AppButton
            label={codeSent ? '인증코드 다시 받기' : '인증코드 받기'}
            variant={codeSent ? 'outline' : 'primary'}
            onPress={sendCode}
            loading={busy && !codeSent}
          />

          {codeSent && (
            <View style={{ marginTop: spacing.md }}>
              <View style={s.noticeBox}>
                <Text style={s.noticeBoxText}>
                  ✓ 인증코드가 발송되었습니다. 문자로 받은 6자리를 입력하세요.
                </Text>
              </View>
              <Field
                label="인증코드 6자리"
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
              />
              <AppButton label="로그인하기" onPress={submit} loading={busy} />
            </View>
          )}
        </View>
      </FadeInUp>

      {notice && !codeSent ? (
        <FadeInUp delay={300}>
          <View style={s.noticeBox}>
            <Text style={s.noticeBoxText}>{notice}</Text>
          </View>
        </FadeInUp>
      ) : null}

      <ErrorBanner message={error} />

      {/* 하단 회원가입 이동 카드 */}
      <FadeInUp delay={320}>
        <View style={s.signupCard}>
          <Text style={[s.signupCardTitle, { color: colors.text, fontSize: font.bodyLarge }]}>
            아직 계정이 없으신가요?
          </Text>
          <Text style={[s.signupCardDesc, { color: colors.textMuted, fontSize: font.body }]}>
            10초만에 빠르게 가입하고 바로 서비스를 이용해 보세요.
          </Text>
          <View style={{ height: spacing.xs }} />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="회원가입 하기"
            onPress={onSignup}
            style={s.signupBtn}
          >
            <Text style={[s.signupBtnText, { color: colors.primary, fontSize: font.bodyLarge }]}>
              회원가입 하기 ➔
            </Text>
          </PressableScale>
        </View>
      </FadeInUp>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    paddingBottom: 56,
  },
  backBtn: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
    minHeight: theme.touch.minButtonHeight,
    paddingRight: theme.spacing.sm,
  },
  backLabel: {
    fontWeight: '800',
  },
  // 브랜드 헤더
  header: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
    ...theme.shadow.primary,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 36,
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
    borderRadius: theme.radius.card,
    height: theme.touch.primaryButtonHeight,
    paddingHorizontal: theme.spacing.sm,
    ...theme.shadow.card,
  },
  socialIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIcon: {
    fontSize: 18,
    fontWeight: '800',
  },
  socialLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.bodyLarge,
    fontWeight: '700',
  },
  socialBadge: {
    backgroundColor: '#191919',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  socialBadgeText: {
    color: '#FEE500',
    fontSize: 13,
    fontWeight: '800',
  },
  // 구분선
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: theme.spacing.sm,
    fontWeight: '600',
  },
  // 메인 카드 컨테이너
  cardContainer: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.card,
  },
  noticeBox: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.button,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#C5D6FA',
  },
  noticeBoxText: {
    color: theme.colors.primary,
    fontSize: theme.font.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  // 회원가입 하단 카드
  signupCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  signupCardTitle: {
    fontWeight: '800',
    marginBottom: 4,
  },
  signupCardDesc: {
    textAlign: 'center',
  },
  signupBtn: {
    minHeight: theme.touch.minButtonHeight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  signupBtnText: {
    fontWeight: '800',
  },
});
