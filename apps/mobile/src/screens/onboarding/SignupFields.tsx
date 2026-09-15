import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppButton, Field } from '../../components/ui';
import { AppIcon } from '../../components/AppIcon';
import { theme } from '../../theme';
import type { SignupState } from './useSignup';

/**
 * 2단계 — 이름·번호 인증·비밀번호(업체는 사업자등록번호까지).
 *
 * 인증코드 입력칸은 코드를 보낸 뒤에만 나타난다. 미리 띄워 두면 "아직 못 받았는데
 * 여기 뭘 넣으라는 거지"가 되고, 번호 칸은 발송 후 잠가서 다른 번호로 인증한 코드가
 * 섞이는 걸 막는다.
 *
 * 비밀번호 확인은 **치는 중에** 불일치를 알린다 — 제출하고 나서 알려 주면 두 칸을
 * 다시 다 지우고 시작하게 된다.
 */
export function SignupFields({ signup }: { signup: SignupState }) {
  const { isCompany, codeSent } = signup;

  return (
    <View style={styles.card}>
      <Field
        label={isCompany ? '업체명' : '이름'}
        required
        value={signup.name}
        onChangeText={signup.setName}
        placeholder={isCompany ? '예) 대한철거(주)' : '예) 홍길동'}
        autoComplete={isCompany ? 'organization' : 'name'}
        textContentType={isCompany ? 'organizationName' : 'name'}
        returnKeyType="next"
        hint={isCompany ? '사업자등록증 상의 정확한 상호를 입력하세요.' : '실명을 입력하세요.'}
      />
      <Field
        label="휴대폰번호"
        required
        value={signup.phone}
        onChangeText={signup.setPhone}
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
        onPress={signup.sendCode}
        loading={signup.busy && !codeSent}
      />

      {codeSent ? (
        <View style={styles.codeBlock}>
          <View style={styles.noticeBox}>
            <Text style={styles.noticeBoxText}>
              ✓ 인증코드를 발송했어요. 문자로 받은 6자리를 입력하세요.
            </Text>
          </View>
          <Field
            label="인증코드 6자리"
            required
            value={signup.code}
            onChangeText={signup.setCode}
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
          value={signup.password}
          onChangeText={signup.setPassword}
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
          value={signup.passwordConfirm}
          onChangeText={signup.setPasswordConfirm}
          placeholder="비밀번호를 한 번 더 입력"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={
            signup.passwordConfirm.length > 0 && signup.password !== signup.passwordConfirm
              ? '비밀번호가 서로 달라요.'
              : null
          }
        />
      </View>

      {isCompany ? (
        <View style={styles.businessBlock}>
          <Field
            label="사업자등록번호"
            required
            value={signup.businessNumber}
            onChangeText={signup.setBusinessNumber}
            placeholder="000-00-00000"
            keyboardType="number-pad"
            maxLength={12}
            hint="가입 후 관리자 승인이 완료되면 매칭 수주가 활성화됩니다."
          />
        </View>
      ) : null}
    </View>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  codeBlock: {
    marginTop: theme.spacing.md,
  },
  businessBlock: {
    marginTop: theme.spacing.sm,
  },
  card: {
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
});
