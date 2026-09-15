import { isCompanyType, type UserType } from '@dimol/shared';

/**
 * 회원가입 입력 검증 — 화면에서 떼어낸 순수 함수.
 *
 * 가입은 한 번 막히면 사용자가 그대로 떠나는 지점이라, 어디가 왜 막혔는지가
 * 정확해야 한다. 규칙을 화면 밖에 두면 문구와 순서를 화면 없이도 확인할 수 있다.
 *
 * 최종 검증은 서버가 한다(중복 번호·사업자등록번호 유효성 등). 여기서는 서버까지
 * 보내 봐야 소용없는 것들만 먼저 거른다.
 */

export interface SignupValues {
  userType: UserType;
  name: string;
  phone: string;
  code: string;
  codeSent: boolean;
  password: string;
  passwordConfirm: string;
  termsAccepted: boolean;
}

/** 숫자만 10자리 이상이면 휴대폰번호로 간주(서버가 최종 검증). */
export function isPhoneLike(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10;
}

/** 비밀번호 최소 길이 — 서버 규칙과 같은 값을 쓴다. */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * 첫 번째로 걸리는 문제 하나를 돌려준다(없으면 null).
 *
 * 요청 폼과 달리 여기서는 필드별로 모아 주지 않고 하나씩 알린다. 가입 폼은
 * 순서대로 채우는 흐름이고(번호 인증이 끝나야 다음이 의미가 있다), 인증 단계를
 * 건너뛴 채 여러 오류를 한꺼번에 띄우면 무엇부터 해야 할지가 오히려 흐려진다.
 */
export function validateSignup(values: SignupValues): string | null {
  const isCompany = isCompanyType(values.userType);

  if (!values.termsAccepted) return '이용약관 및 개인정보처리방침에 동의해 주세요.';
  if (values.name.trim().length === 0) {
    return isCompany ? '업체명을 입력해 주세요.' : '이름을 입력해 주세요.';
  }
  if (!isPhoneLike(values.phone)) return '휴대폰번호를 정확히 입력해 주세요.';
  if (!values.codeSent || values.code.trim().length === 0) {
    return '휴대폰 인증코드를 받아 입력해 주세요.';
  }
  if (values.password.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호를 ${MIN_PASSWORD_LENGTH}자 이상으로 설정해 주세요.`;
  }
  if (values.password !== values.passwordConfirm) return '비밀번호가 일치하지 않습니다.';
  return null;
}
