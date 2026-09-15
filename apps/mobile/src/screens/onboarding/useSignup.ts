import { useState } from 'react';
import { isCompanyType, type AuthSession, type UserType } from '@dimol/shared';
import { ApiError, createUser, requestOtp, verifyOtp } from '../../api/client';
import { isPhoneLike, validateSignup } from '../../lib/signup-validation';

/**
 * 회원가입 상태 — 유형 선택, 번호 인증, 계정 생성.
 *
 * 번호 인증이 두 가지 일을 겸한다는 게 이 흐름의 핵심이다: 인증에 성공했는데
 * **이미 가입된 번호**면 새로 만들지 않고 그대로 로그인시킨다. 안 그러면
 * "이미 가입된 번호입니다"를 보고 로그인 화면으로 옮겨 다시 인증해야 한다.
 */
export function useSignup({
  onComplete,
  social,
}: {
  onComplete: (session: AuthSession) => void;
  /** 소셜 로그인으로 진입한 가입 — 티켓으로 계정에 소셜 신원을 연결한다. */
  social?: { ticket: string; prefillName?: string };
}) {
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

  return {
    userType,
    setUserType,
    isCompany,
    name,
    setName,
    phone,
    setPhone,
    code,
    setCode,
    codeSent,
    password,
    setPassword,
    passwordConfirm,
    setPasswordConfirm,
    businessNumber,
    setBusinessNumber,
    termsAccepted,
    setTermsAccepted,
    notice,
    error,
    busy,
    sendCode,
    submit,
  };
}

export type SignupState = ReturnType<typeof useSignup>;
