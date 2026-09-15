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

        <FadeInUp delay={100}>
          <SectionStep label="1단계" title="어떤 역할로 가입하시나요?" />
        </FadeInUp>

        <RoleSelector value={signup.userType} onChange={signup.setUserType} />

        <FadeInUp delay={380}>
          <SectionStep label="2단계" title="가입 상세 정보를 입력해 주세요" spaced />
          <SignupFields signup={signup} />
        </FadeInUp>

        {signup.notice && !signup.codeSent ? (
          <FadeInUp delay={420}>
            <View style={styles.noticeBox}>
              <Text style={styles.noticeBoxText}>{signup.notice}</Text>
            </View>
          </FadeInUp>
        ) : null}

        <ErrorBanner message={signup.error} />

        <FadeInUp delay={430}>
          <TermsConsent
            accepted={signup.termsAccepted}
            onToggle={() => signup.setTermsAccepted(!signup.termsAccepted)}
          />
        </FadeInUp>

        <FadeInUp delay={440}>
          <View style={styles.submitBlock}>
            <AppButton
              label="가입 완료하고 시작하기"
              onPress={signup.submit}
              loading={signup.busy}
              disabled={signup.busy}
            />
          </View>
        </FadeInUp>

        {onLogin ? (
          <FadeInUp delay={480}>
            <View style={styles.loginCard}>
              <Text style={styles.loginHelper}>이미 계정이 있으신가요?</Text>
              <PressableScale accessibilityRole="button" onPress={onLogin} style={styles.loginBtn}>
                <Text style={styles.loginBtnText}>로그인 화면으로 이동 ➔</Text>
              </PressableScale>
            </View>
          </FadeInUp>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** 가입 흐름의 단계 제목 — "1단계 / 어떤 역할로…". */
function SectionStep({ label, title, spaced }: { label: string; title: string; spaced?: boolean }) {
  return (
    <View style={[styles.sectionHeader, spaced && styles.sectionHeaderSpaced]}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{label}</Text>
      </View>
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
