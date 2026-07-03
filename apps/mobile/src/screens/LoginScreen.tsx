import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AuthSession } from '@dimol/shared';
import { ApiError, requestOtp, verifyOtp } from '../api/client';
import { AppButton, ErrorBanner, Field } from '../components/ui';
import { theme } from '../theme';

function isPhoneLike(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10;
}

/**
 * 로그인 — 휴대폰 OTP 인증.
 * 1) 번호 입력 → 인증코드 받기  2) 코드 입력 → 로그인.
 * 가입 이력이 없으면 회원가입으로 안내한다(번호는 이미 인증됨).
 */
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
      setNotice('인증코드를 발송했어요. 문자로 받은 6자리를 입력해 주세요.');
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
      // 번호 인증은 됐지만 미가입 → 회원가입 안내.
      setNotice('가입되지 않은 번호예요. 회원가입을 진행해 주세요.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기"
        onPress={onBack}
        style={styles.back}
      >
        <Text style={styles.backLabel}>‹ 뒤로</Text>
      </Pressable>

      <Text style={styles.title}>로그인</Text>
      <Text style={styles.subtitle}>가입하신 휴대폰번호로 인증해 주세요</Text>

      <View style={{ height: theme.spacing.md }} />
      <Field
        label="휴대폰번호"
        value={phone}
        onChangeText={setPhone}
        placeholder="010-0000-0000"
        keyboardType="phone-pad"
        editable={!codeSent}
        autoFocus
      />
      <AppButton
        label={codeSent ? '인증코드 다시 받기' : '인증코드 받기'}
        variant="outline"
        onPress={sendCode}
        loading={busy && !codeSent}
      />

      {codeSent ? (
        <>
          <View style={{ height: theme.spacing.md }} />
          <Field
            label="인증코드"
            value={code}
            onChangeText={setCode}
            placeholder="6자리 숫자"
            keyboardType="number-pad"
            maxLength={6}
          />
          <AppButton label="로그인" onPress={submit} loading={busy} />
        </>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <ErrorBanner message={error} />

      <View style={{ height: theme.spacing.md }} />
      <Text style={styles.helper}>아직 계정이 없으신가요?</Text>
      <AppButton label="회원가입" variant="outline" onPress={onSignup} />
    </View>
  );
}

const { colors, font, spacing } = theme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    padding: spacing.md,
  },
  back: {
    justifyContent: 'center',
    marginBottom: spacing.sm,
    minHeight: theme.touch.minButtonHeight,
    minWidth: theme.touch.minButtonHeight,
  },
  backLabel: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  notice: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  helper: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
