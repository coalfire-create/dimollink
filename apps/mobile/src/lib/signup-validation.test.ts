import { describe, expect, it } from 'vitest';
import { isPhoneLike, validateSignup, type SignupValues } from './signup-validation';

/**
 * 가입은 한 번 막히면 사용자가 떠나는 지점이라, "막아야 할 것"과
 * "막으면 안 되는 것"을 둘 다 고정해 둔다.
 */

const valid: SignupValues = {
  userType: 'CONSUMER',
  name: '홍길동',
  phone: '010-1234-5678',
  code: '123456',
  codeSent: true,
  password: 'secret1',
  passwordConfirm: 'secret1',
  termsAccepted: true,
};

describe('isPhoneLike', () => {
  it('구분자가 섞여도 숫자 10자리 이상이면 통과한다', () => {
    expect(isPhoneLike('010-1234-5678')).toBe(true);
    expect(isPhoneLike('01012345678')).toBe(true);
  });

  it('자릿수가 모자라면 막는다', () => {
    expect(isPhoneLike('010-1234')).toBe(false);
    expect(isPhoneLike('')).toBe(false);
  });
});

describe('validateSignup', () => {
  it('제대로 채운 폼은 통과한다', () => {
    expect(validateSignup(valid)).toBeNull();
  });

  it('약관 동의를 가장 먼저 본다 — 동의 없이는 어떤 정보도 받을 수 없다', () => {
    expect(validateSignup({ ...valid, termsAccepted: false, name: '' })).toContain('약관');
  });

  it('업체는 "업체명", 개인은 "이름"으로 물어본다', () => {
    expect(validateSignup({ ...valid, name: ' ' })).toContain('이름');
    expect(validateSignup({ ...valid, name: ' ', userType: 'DEMOLITION_COMPANY' })).toContain(
      '업체명',
    );
  });

  it('인증코드를 받기 전에는 제출할 수 없다', () => {
    expect(validateSignup({ ...valid, codeSent: false })).toContain('인증코드');
    expect(validateSignup({ ...valid, code: '  ' })).toContain('인증코드');
  });

  it('비밀번호 길이와 확인 일치를 본다', () => {
    expect(validateSignup({ ...valid, password: '123', passwordConfirm: '123' })).toContain('6자');
    expect(validateSignup({ ...valid, passwordConfirm: 'other' })).toContain('일치');
  });
});
