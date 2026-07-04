import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PILOT, isCompanyType, type AuthSession, type UserType } from '@dimol/shared';
import { ApiError, createUser, requestOtp, verifyOtp } from '../api/client';
import { AppButton, ErrorBanner, Field } from '../components/ui';
import { FadeInUp } from '../components/motion';
import { theme } from '../theme';
import brandmark from '../../assets/brandmark.png';

/** 숫자만 10자리 이상이면 휴대폰번호로 간주(서버가 최종 검증). */
function isPhoneLike(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10;
}

/**
 * 온보딩 — 가입 유형 선택 후 가입 (Phase 1 /users).
 * 소비자는 즉시 승인, 업체는 사업자등록번호 + 올바로 회원 검증 후 관리자 승인 대기.
 * 파일럿 지역은 양평 고정 — 지역 선택 UI를 두지 않는다.
 */

const TYPE_OPTIONS: Array<{ type: UserType; title: string; description: string }> = [
  { type: 'CONSUMER', title: '소비자', description: '철거·폐기물 처리를 맡기고 싶어요' },
  { type: 'DEMOLITION_COMPANY', title: '철거업체', description: '철거 작업을 수주하고 싶어요' },
  { type: 'TRANSPORT_COMPANY', title: '운반업체', description: '폐기물 운반 콜을 받고 싶어요' },
  { type: 'WASTE_TREATMENT_PLANT', title: '처리장', description: '폐기물 반입 예약을 받고 싶어요' },
];

export function OnboardingScreen({
  onComplete,
  onBack,
  onLogin,
}: {
  onComplete: (session: AuthSession) => void;
  onBack?: () => void;
  onLogin?: () => void;
}) {
  const [userType, setUserType] = useState<UserType>('CONSUMER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [businessNumber, setBusinessNumber] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isCompany = isCompanyType(userType);

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
    if (name.trim().length === 0) {
      setError(isCompany ? '업체명을 입력해 주세요.' : '이름을 입력해 주세요.');
      return;
    }
    if (!isPhoneLike(phone)) {
      setError('휴대폰번호를 정확히 입력해 주세요.');
      return;
    }
    if (!codeSent || code.trim().length === 0) {
      setError('휴대폰 인증코드를 받아 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      // 번호 인증 → 이미 가입된 번호면 곧바로 로그인 처리.
      const verified = await verifyOtp(phone.trim(), code.trim());
      if (verified.session) {
        setNotice(null);
        onComplete(verified.session);
        return;
      }
      const session = await createUser({
        userType,
        name: name.trim(),
        region: PILOT.region,
        phone: phone.trim(),
        businessNumber: isCompany ? businessNumber.trim() : undefined,
      });
      onComplete(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '가입 처리에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          onPress={onBack}
          style={styles.back}
        >
          <Text style={styles.backLabel}>‹ 뒤로</Text>
        </Pressable>
      ) : null}
      <FadeInUp delay={40}>
        <Image
          source={brandmark}
          style={styles.brandmark}
          resizeMode="contain"
          accessibilityLabel="비움 로고"
        />
        <Text style={styles.appName}>비움</Text>
      </FadeInUp>

      <Text style={styles.stepTitle}>어떤 일로 오셨나요?</Text>
      {TYPE_OPTIONS.map((option, i) => {
        const selected = userType === option.type;
        return (
          <FadeInUp key={option.type} delay={120 + i * 70}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => setUserType(option.type)}
            style={[styles.roleCard, selected && styles.roleCardSelected]}
          >
            <Text style={[styles.roleTitle, selected && { color: theme.colors.primary }]}>
              {selected ? '✓ ' : ''}
              {option.title}
            </Text>
            <Text style={styles.roleDescription}>{option.description}</Text>
          </Pressable>
          </FadeInUp>
        );
      })}

      <View style={{ height: theme.spacing.md }} />
      <Field
        label={isCompany ? '업체명' : '이름'}
        value={name}
        onChangeText={setName}
        placeholder={isCompany ? '예) 양평철거(주)' : '예) 김양평'}
      />
      <Field
        label="휴대폰번호"
        value={phone}
        onChangeText={setPhone}
        placeholder="010-0000-0000"
        keyboardType="phone-pad"
        editable={!codeSent}
        hint="로그인할 때 사용하는 번호예요."
      />
      <AppButton
        label={codeSent ? '인증코드 다시 받기' : '인증코드 받기'}
        variant="outline"
        onPress={sendCode}
        loading={busy && !codeSent}
      />
      {codeSent ? (
        <>
          <View style={{ height: theme.spacing.sm }} />
          <Field
            label="인증코드"
            value={code}
            onChangeText={setCode}
            placeholder="6자리 숫자"
            keyboardType="number-pad"
            maxLength={6}
          />
        </>
      ) : null}

      {isCompany ? (
        <Field
          label="사업자등록번호"
          value={businessNumber}
          onChangeText={setBusinessNumber}
          placeholder="000-00-00000"
          keyboardType="number-pad"
          hint="가입 후 관리자 승인이 끝나면 매칭을 받을 수 있어요."
        />
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <ErrorBanner message={error} />
      <AppButton label="시작하기" onPress={submit} loading={busy} />

      {onLogin ? (
        <>
          <View style={{ height: theme.spacing.md }} />
          <Text style={styles.loginHelper}>이미 계정이 있으신가요?</Text>
          <AppButton label="로그인" variant="outline" onPress={onLogin} />
        </>
      ) : null}
    </ScrollView>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.md,
  },
  back: {
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    minWidth: theme.touch.minButtonHeight,
  },
  backLabel: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  loginHelper: {
    color: colors.textMuted,
    fontSize: font.body,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  notice: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  brandmark: {
    alignSelf: 'center',
    height: 72,
    marginTop: spacing.lg,
    width: 72,
  },
  appName: {
    color: colors.primary,
    fontSize: font.titleLarge,
    fontWeight: '800',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  roleCard: {
    backgroundColor: colors.background,
    borderColor: 'transparent',
    borderRadius: radius.card,
    borderWidth: 2,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...theme.shadow.card,
  },
  roleCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  roleTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '700',
  },
  roleDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
});
