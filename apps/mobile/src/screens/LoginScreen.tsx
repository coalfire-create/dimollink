import React, { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import brandmark from '../../assets/brandmark.png';
import type { AuthSession } from '@dimol/shared';
import { ApiError, login } from '../api/client';
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
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  async function submit() {
    // 이미 보내는 중이면 무시 — 버튼을 두 번 눌러 로그인이 두 번 나가지 않게.
    if (busy) return;
    setError(null);
    if (!isPhoneLike(phone)) {
      setError('휴대폰번호를 정확히 입력해 주세요.');
      return;
    }
    if (password.length === 0) {
      setError('비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const session = await login(phone.trim(), password);
      onSuccess(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const { colors, font, spacing } = theme;

  return (
    <KeyboardAvoidingView
      // 키보드가 올라오면 비밀번호 칸과 로그인 버튼이 가려진다 — 그만큼 화면을 밀어 올린다.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.container,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg },
        ]}
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
          {/* 소비자·업체가 같은 화면으로 들어온다 — "파트너스 로그인"이라고 적으면 소비자는
            자기 화면이 아닌 줄 안다. 묻는 것 하나만 크게 쓴다. */}
          <View style={s.header}>
            <Image
              source={brandmark}
              style={s.brandmark}
              resizeMode="contain"
              accessibilityLabel="비움 로고"
            />
            <Text
              accessibilityRole="header"
              style={[s.title, { color: colors.text, fontSize: font.titleLarge }]}
            >
              {'휴대폰 번호로\n로그인해 주세요'}
            </Text>
          </View>
        </FadeInUp>

        <FadeInUp delay={160}>
          <View>
            {/* 오류는 입력칸 위에 — 버튼 아래에 두면 키보드가 올라온 상태에서 안 보인다. */}
            <ErrorBanner message={error} />
            <Field
              label="휴대폰번호"
              required
              value={phone}
              onChangeText={setPhone}
              placeholder="010-0000-0000"
              keyboardType="phone-pad"
              // 기기·비밀번호 관리자의 자동 완성을 쓸 수 있게 한다.
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={13}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              hint="가입할 때 등록한 번호예요."
            />
            <Field
              ref={passwordRef}
              label="비밀번호"
              required
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              // 키보드 '완료'로 바로 로그인 — 버튼까지 스크롤하지 않아도 된다.
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
            />
            <AppButton label="로그인" onPress={submit} loading={busy} disabled={busy} />
          </View>
        </FadeInUp>

        <FadeInUp delay={300}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="처음이신가요? 회원가입하기"
            onPress={onSignup}
            style={s.signupLink}
          >
            <Text style={[s.signupText, { color: colors.textMuted, fontSize: font.body }]}>
              처음이신가요?{' '}
              <Text style={{ color: colors.primary, fontWeight: '800' }}>회원가입</Text>
            </Text>
          </PressableScale>
        </FadeInUp>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    // 세로 여백은 안전영역에 맞춰 런타임에 정한다.
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
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  brandmark: {
    height: 56,
    marginBottom: theme.spacing.md,
    width: 56,
  },
  title: {
    fontWeight: '800',
    lineHeight: 38,
  },
  signupLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    minHeight: theme.touch.minButtonHeight,
  },
  signupText: {
    fontWeight: '600',
  },
});
