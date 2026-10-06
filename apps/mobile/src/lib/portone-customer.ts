import type { UserProfile } from '@dimol/shared';

/**
 * 결제창·정기결제창에 넘길 구매자 정보.
 *
 * KG이니시스는 구매자 **이름이 필수**이고, PC 결제창은 **연락처·이메일**까지 필수다
 * (포트원 KG이니시스 V2 연동 문서). 빠지면 결제창이 열리지 않고 오류로 끝난다.
 * PG 마다 요구가 달라도 아는 값을 다 넘기는 쪽이 안전하므로 PG 를 가리지 않고 쓴다.
 *
 * 이메일은 프로필에 따로 없어서 소셜 로그인으로 받은 값을 쓴다. 없으면 넣지 않는다 —
 * 지어낸 주소를 넣으면 결제 영수증이 엉뚱한 곳으로 간다.
 */
export interface PortOneCustomer {
  customerId: string;
  fullName: string;
  phoneNumber?: string;
  email?: string;
}

export function portOneCustomer(user: UserProfile): PortOneCustomer {
  const phoneNumber = user.phone?.replace(/\D/g, '');
  const email = user.socialIdentities?.find((s) => s.email)?.email;
  return {
    customerId: user.id,
    fullName: user.name,
    ...(phoneNumber ? { phoneNumber } : {}),
    ...(email ? { email } : {}),
  };
}
