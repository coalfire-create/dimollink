import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isCompanyType, type AuthSession, type UserType } from '@dimol/shared';
import { ApiError, createUser, requestOtp, verifyOtp, WEB_BASE_URL } from '../api/client';
import { FEATURE_INTERIOR } from '../featureFlags';
import { AppButton, ErrorBanner, Field } from '../components/ui';
import { AppIcon, type IconName } from '../components/AppIcon';
import { FadeInUp, PressableScale } from '../components/motion';
import { isPhoneLike, validateSignup } from '../lib/signup-validation';
import { theme } from '../theme';
import brandmark from '../../assets/brandmark.png';

/**
 * 온보딩 — 가입 유형 선택 후 가입 (Phase 1 /users).
 * 소비자는 즉시 승인, 업체는 사업자등록번호 + 올바로 회원 검증 후 관리자 승인 대기.
 * 활동 지역을 직접 입력받는다(전국 이용 가능).
 */

const TYPE_OPTIONS: Array<{
  type: UserType;
  title: string;
  description: string;
  iconName: IconName;
  badge?: string;
}> = [
  {
    type: 'CONSUMER',
    title: '소비자',
    description: '철거·폐기물 처리를 맡기고 싶어요',
    iconName: 'home',
    badge: '개인/기업',
  },
  {
    type: 'DEMOLITION_COMPANY',
    title: '철거업체',
    description: '철거 작업을 수주하고 싶어요',
    iconName: 'hammer',
    badge: '파트너',
  },
  {
    type: 'TRANSPORT_COMPANY',
    title: '운반업체',
    description: '폐기물 운반 콜을 받고 싶어요',
    iconName: 'truck',
    badge: '파트너',
  },
  {
    type: 'WASTE_TREATMENT_PLANT',
    title: '처리장',
    description: '폐기물 반입 예약을 받고 싶어요',
    iconName: 'building',
    badge: '파트너',
  },
  {
    type: 'INTERIOR_COMPANY',
    title: '인테리어 업체',
    description: '인테리어 시공 견적을 넣고 싶어요',
    iconName: 'palette',
    badge: '파트너',
  },
];

export function OnboardingScreen({
  onComplete,
  onBack,
  onLogin,
  social,
}: {
  onComplete: (session: AuthSession) => void;
  onBack?: () => void;
  onLogin?: () => void;
  /** 소셜 로그인으로 진입한 가입 — 티켓으로 계정에 소셜 신원을 연결하고 이름을 프리필한다. */
  social?: { ticket: string; prefillName?: string };
}) {
  const insets = useSafeAreaInsets();
  const [userType, setUserType] = useState<UserType>('CONSUMER');
  const [name, setName] = useState(social?.prefillName ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [businessNumber, setBusinessNumber] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
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
    // 규칙은 화면 밖(테스트가 붙은 순수 함수)에 있다 — [[signup-validation]].
    const problem = validateSignup({
      userType,
      name,
      phone,
      code,
      codeSent,
      password,
      passwordConfirm,
      termsAccepted,
    });
    setError(problem);
    if (problem) return;

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
        phone: phone.trim(),
        password,
        businessNumber: isCompany ? businessNumber.trim() : undefined,
        ...(social?.ticket ? { socialTicket: social.ticket } : {}),
      });
      onComplete(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '가입 처리에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      // 입력칸이 많아 아래쪽 칸(비밀번호·사업자번호)이 키보드에 가린다.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.keyboardWrap}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 상단 뒤로가기 내비 */}
        {onBack ? (
          <FadeInUp delay={20}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="뒤로 가기"
              onPress={onBack}
              style={styles.back}
            >
              <Text style={styles.backLabel}>‹ 뒤로</Text>
            </Pressable>
          </FadeInUp>
        ) : null}

        {/* 브랜드 타이틀 헤더 */}
        <FadeInUp delay={60}>
          <View style={styles.headerWrap}>
            <Image
              source={brandmark}
              style={styles.brandmark}
              resizeMode="contain"
              accessibilityLabel="비움 로고"
            />
            <Text style={styles.appName}>비움 회원가입</Text>
            <Text style={styles.appSubtitle}>
              {social
                ? '소셜 계정 인증이 완료되었습니다. 회원 정보를 입력해 주세요.'
                : '10초만에 가입하고 신속한 매칭 서비스를 이용하세요.'}
            </Text>
          </View>
        </FadeInUp>

        {/* Step 1: 가입 유형 선택 */}
        <FadeInUp delay={100}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1단계</Text>
            </View>
            <Text style={styles.stepTitle}>어떤 역할로 가입하시나요?</Text>
          </View>
        </FadeInUp>

        {TYPE_OPTIONS.filter(
          // 인테리어 업체 가입은 파일럿 밖 — FEATURE_INTERIOR 가 켜졌을 때만 노출.
          (option) => FEATURE_INTERIOR || option.type !== 'INTERIOR_COMPANY',
        ).map((option, i) => {
          const selected = userType === option.type;
          return (
            <FadeInUp key={option.type} delay={120 + i * 50}>
              <PressableScale
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setUserType(option.type)}
                style={[styles.roleCard, selected && styles.roleCardSelected]}
              >
                <View style={[styles.iconCircle, selected && styles.iconCircleSelected]}>
                  <AppIcon
                    name={option.iconName}
                    size={22}
                    color={selected ? colors.primary : colors.text}
                    filled={selected}
                  />
                </View>
                <View style={styles.roleInfo}>
                  <View style={styles.roleHeaderRow}>
                    <Text style={[styles.roleTitle, selected && { color: colors.primary }]}>
                      {option.title}
                    </Text>
                    {option.badge ? (
                      <View style={[styles.tagBadge, selected && styles.tagBadgeSelected]}>
                        <Text style={[styles.tagBadgeText, selected && { color: colors.primary }]}>
                          {option.badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.roleDescription}>{option.description}</Text>
                </View>
                <View style={[styles.radioCheck, selected && styles.radioCheckSelected]}>
                  {selected && <Text style={styles.radioCheckMark}>✓</Text>}
                </View>
              </PressableScale>
            </FadeInUp>
          );
        })}

        {/* Step 2: 기본 정보 및 인증 입력 */}
        <FadeInUp delay={380}>
          <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2단계</Text>
            </View>
            <Text style={styles.stepTitle}>가입 상세 정보를 입력해 주세요</Text>
          </View>

          <View style={styles.formCard}>
            <Field
              label={isCompany ? '업체명' : '이름'}
              required
              value={name}
              onChangeText={setName}
              placeholder={isCompany ? '예) 대한철거(주)' : '예) 홍길동'}
              autoComplete={isCompany ? 'organization' : 'name'}
              textContentType={isCompany ? 'organizationName' : 'name'}
              returnKeyType="next"
              hint={
                isCompany ? '사업자등록증 상의 정확한 상호를 입력하세요.' : '실명을 입력하세요.'
              }
            />
            <Field
              label="휴대폰번호"
              required
              value={phone}
              onChangeText={setPhone}
              placeholder="010-0000-0000"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={13}
              editable={!codeSent}
              hint="로그인 및 매칭 알림 수신에 활용됩니다."
            />
            <AppButton
              label={codeSent ? '인증코드 다시 받기' : '인증코드 받기'}
              variant="outline"
              onPress={sendCode}
              loading={busy && !codeSent}
            />

            {codeSent ? (
              <View style={{ marginTop: spacing.md }}>
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeBoxText}>
                    ✓ 인증코드를 발송했어요. 문자로 받은 6자리를 입력하세요.
                  </Text>
                </View>
                <Field
                  label="인증코드 6자리"
                  required
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  keyboardType="number-pad"
                  // 문자로 온 인증번호를 키보드 위에서 바로 채울 수 있게 한다.
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  maxLength={6}
                />
              </View>
            ) : null}

            <View style={styles.pwSection}>
              <View style={styles.pwHeaderRow}>
                <AppIcon name="lock" size={17} color={colors.primary} filled />
                <Text style={styles.pwSectionLabel}>로그인 비밀번호</Text>
              </View>
              <Field
                label="비밀번호"
                required
                value={password}
                onChangeText={setPassword}
                placeholder="6자 이상"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                hint="다음 로그인부터 이 비밀번호로 로그인해요."
              />
              <Field
                label="비밀번호 확인"
                required
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="비밀번호를 한 번 더 입력"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                error={
                  passwordConfirm.length > 0 && password !== passwordConfirm
                    ? '비밀번호가 서로 달라요.'
                    : null
                }
              />
            </View>

            {isCompany ? (
              <View style={{ marginTop: spacing.sm }}>
                <Field
                  label="사업자등록번호"
                  required
                  value={businessNumber}
                  onChangeText={setBusinessNumber}
                  placeholder="000-00-00000"
                  keyboardType="number-pad"
                  maxLength={12}
                  hint="가입 후 관리자 승인이 완료되면 매칭 수주가 활성화됩니다."
                />
              </View>
            ) : null}
          </View>
        </FadeInUp>

        {notice && !codeSent ? (
          <FadeInUp delay={420}>
            <View style={styles.noticeBox}>
              <Text style={styles.noticeBoxText}>{notice}</Text>
            </View>
          </FadeInUp>
        ) : null}

        <ErrorBanner message={error} />

        {/* 이용약관 동의 */}
        <FadeInUp delay={430}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: termsAccepted }}
            onPress={() => setTermsAccepted((v) => !v)}
            style={styles.termsRow}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              {'(필수) '}
              <Text
                style={styles.termsLink}
                onPress={() => Linking.openURL(`${WEB_BASE_URL}/terms`)}
              >
                이용약관
              </Text>
              {' 및 '}
              <Text
                style={styles.termsLink}
                onPress={() => Linking.openURL(`${WEB_BASE_URL}/privacy`)}
              >
                개인정보처리방침
              </Text>
              에 동의합니다
            </Text>
          </Pressable>
        </FadeInUp>

        {/* 제출 CTA 버튼 */}
        <FadeInUp delay={440}>
          <View style={{ marginTop: spacing.md }}>
            <AppButton label="가입 완료하고 시작하기" onPress={submit} loading={busy} />
          </View>
        </FadeInUp>

        {/* 로그인 링크 */}
        {onLogin ? (
          <FadeInUp delay={480}>
            <View style={styles.loginCard}>
              <Text style={styles.loginHelper}>이미 계정이 있으신가요?</Text>
              <PressableScale onPress={onLogin} style={styles.loginBtn}>
                <Text style={styles.loginBtnText}>로그인 화면으로 이동 ➔</Text>
              </PressableScale>
            </View>
          </FadeInUp>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  keyboardWrap: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.md,
    paddingBottom: 56,
  },
  back: {
    justifyContent: 'center',
    minHeight: theme.touch.minButtonHeight,
    paddingRight: spacing.sm,
    alignSelf: 'flex-start',
  },
  backLabel: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  // 브랜드 헤더
  headerWrap: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  brandmark: {
    height: 64,
    width: 64,
    marginBottom: spacing.xs,
  },
  appName: {
    color: colors.text,
    fontSize: font.titleLarge,
    fontWeight: '900',
    textAlign: 'center',
  },
  appSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    textAlign: 'center',
    marginTop: spacing.xs / 2,
  },
  // 섹션 타이틀
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  stepBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
  },
  stepBadgeText: {
    color: colors.background,
    fontSize: font.caption,
    fontWeight: '800',
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.title,
    fontWeight: '800',
  },
  // 가입 유형 선택 카드
  roleCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1.5,
    marginBottom: spacing.sm,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadow.card,
  },
  roleCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  iconCircleSelected: {
    backgroundColor: colors.background,
    borderColor: colors.primary,
  },
  iconText: {
    fontSize: 24,
  },
  roleInfo: {
    flex: 1,
  },
  roleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  roleTitle: {
    color: colors.text,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
  tagBadge: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: spacing.xs / 2,
  },
  tagBadgeSelected: {
    backgroundColor: colors.background,
  },
  tagBadgeText: {
    color: colors.textMuted,
    fontSize: font.caption,
    fontWeight: '700',
  },
  roleDescription: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs / 2,
  },
  radioCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  radioCheckSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  radioCheckMark: {
    color: colors.background,
    fontSize: theme.glyph.inline,
    fontWeight: '900',
  },
  // 폼 카드
  formCard: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...theme.shadow.card,
  },
  noticeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.button,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeBoxText: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  // 로그인 비밀번호 섹션 — 인증 영역과 시각적으로 구분
  pwSection: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  pwHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  pwSectionLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '800',
  },
  // 이용약관 동의
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
    backgroundColor: colors.background,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.background,
    fontSize: theme.glyph.inline,
    fontWeight: '900',
  },
  termsText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: font.body + 6,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  // 하단 로그인 이동
  loginCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  loginHelper: {
    color: colors.textMuted,
    fontSize: font.body,
  },
  loginBtn: {
    minHeight: theme.touch.minButtonHeight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs / 2,
  },
  loginBtnText: {
    color: colors.primary,
    fontSize: font.bodyLarge,
    fontWeight: '800',
  },
});
