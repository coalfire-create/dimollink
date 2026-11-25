import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthSession } from '@dimol/shared';
import { AppIcon } from '../components/AppIcon';
import { AppButton, ErrorBanner } from '../components/ui';
import { FadeInUp, PressableScale } from '../components/motion';
import { RoleSelector } from './onboarding/RoleSelector';
import { SignupFields } from './onboarding/SignupFields';
import { TermsConsent } from './onboarding/TermsConsent';
import { useSignup } from './onboarding/useSignup';
import { theme } from '../theme';
import brandmark from '../../assets/brandmark.png';

/**
 * 회원가입 — 유형 선택(1단계) → 정보 입력·번호 인증(2단계) → 약관 동의 → 가입.
 *
 * 소비자는 즉시 승인되고, 업체는 사업자등록번호 확인 후 관리자 승인을 기다린다.
 * 입력 규칙은 [[signup-validation]], 상태와 가입 호출은 [[useSignup]] 에 있다.
 */
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
  const signup = useSignup({ onComplete, social });

  return (
    <KeyboardAvoidingView
      style={styles.keyboardWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + theme.spacing.md }]}
        keyboardShouldPersistTaps="handled"
      >
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로 가기"
            onPress={onBack}
            style={styles.back}
          >
            <AppIcon name="chevronLeft" size={20} color={colors.textMuted} />
            <Text style={styles.backLabel}>뒤로</Text>
          </Pressable>
        ) : null}

        <FadeInUp delay={0} offset={6}>
          <View style={styles.headerWrap}>
            <Image
              source={brandmark}
              style={styles.brandmark}
              resizeMode="contain"
              accessibilityLabel="비움 로고"
            />
            <Text style={styles.appName} accessibilityRole="header">
              비움 회원가입
            </Text>
            <Text style={styles.appSubtitle}>
              {social
                ? '소셜 계정 인증이 완료되었습니다. 회원 정보를 입력해 주세요.'
                : '역할을 고르고 이름·번호만 적으면 끝나요.'}
            </Text>
          </View>
        </FadeInUp>

        <SectionStep label="1단계" title="어떤 역할로 가입하시나요?" />

        <RoleSelector value={signup.userType} onChange={signup.setUserType} />

        <SectionStep label="2단계" title="가입 상세 정보를 입력해 주세요" spaced />
        <SignupFields signup={signup} />

        {signup.notice && !signup.codeSent ? (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeBoxText}>{signup.notice}</Text>
          </View>
        ) : null}

        <ErrorBanner message={signup.error} />

        <TermsConsent
          accepted={signup.termsAccepted}
          onToggle={() => signup.setTermsAccepted(!signup.termsAccepted)}
        />

        <View style={styles.submitBlock}>
          <AppButton
            label="가입 완료하고 시작하기"
            onPress={signup.submit}
            loading={signup.busy}
            disabled={signup.busy}
          />
        </View>

        {onLogin ? (
          <View style={styles.loginCard}>
            <Text style={styles.loginHelper}>이미 계정이 있으신가요?</Text>
            <PressableScale accessibilityRole="button" onPress={onLogin} style={styles.loginBtn}>
              <Text style={styles.loginBtnText}>로그인 화면으로 이동</Text>
            </PressableScale>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 가입 흐름의 단계 제목 — "1단계 / 어떤 역할로…". */
function SectionStep({ label, title, spaced }: { label: string; title: string; spaced?: boolean }) {
  return (
    <View style={[styles.sectionHeader, spaced && styles.sectionHeaderSpaced]}>
      <Text style={styles.stepLabel}>{label}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  sectionHeaderSpaced: {
    marginTop: theme.spacing.lg,
  },
  submitBlock: {
    marginTop: theme.spacing.md,
  },
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
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xs / 2,
    minHeight: theme.touch.minButtonHeight,
    paddingRight: spacing.sm,
  },
  backLabel: {
    color: colors.textMuted,
    fontSize: font.bodyLarge,
    fontWeight: '600',
  },
  // 로그인 화면과 같은 머리 — 왼쪽 정렬 큰 제목(가운데 정렬 로고 배너는 뺐다).
  headerWrap: {
    marginVertical: spacing.md,
  },
  brandmark: {
    height: 56,
    width: 56,
    marginBottom: spacing.md,
  },
  appName: {
    color: colors.text,
    fontSize: font.titleLarge,
    letterSpacing: theme.tracking.title,
    fontWeight: '700',
  },
  appSubtitle: {
    color: colors.textMuted,
    fontSize: font.body,
    marginTop: spacing.xs,
  },
  sectionHeader: {
    marginBottom: spacing.sm,
  },
  stepLabel: {
    color: colors.primary,
    fontSize: font.caption,
    fontWeight: '700',
  },
  stepTitle: {
    color: colors.text,
    fontSize: font.title,
    letterSpacing: theme.tracking.title,
    fontWeight: '700',
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
  loginCard: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
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
    fontWeight: '700',
  },
});
