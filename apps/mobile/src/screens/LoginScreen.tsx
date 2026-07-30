import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AuthSession } from '@dimol/shared';
import { ApiError, requestOtp, verifyOtp } from '../api/client';
import { AppButton, ErrorBanner, Field } from '../components/ui';
import { FadeInUp, PressableScale } from '../components/motion';
import { theme } from '../theme';

function isPhoneLike(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10;
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

      <FadeInUp delay={60}>
        <View style={s.header}>
          <View style={[s.logoMark, { backgroundColor: colors.primary }]}>
            <Text style={s.logoText}>D</Text>
          </View>
          <Text style={[s.title, { color: colors.text, fontSize: font.titleLarge }]}>
            반가워요! 👋{'\n'}비움에 로그인하세요
          </Text>
          <Text style={[s.subtitle, { color: colors.textMuted, fontSize: font.body }]}>
            휴대폰 번호로 안전하게 로그인하세요
          </Text>
        </View>
      </FadeInUp>

      <FadeInUp delay={160}>
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
        <FadeInUp delay={260}>
          <View style={s.noticeBox}>
            <Text style={s.noticeBoxText}>{notice}</Text>
          </View>
        </FadeInUp>
      ) : null}

      <ErrorBanner message={error} />

      <FadeInUp delay={300}>
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
