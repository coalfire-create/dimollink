import type { UserProfile } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { knownEmail, portOneCustomer } from './portone-customer';

const base = {
  id: 'u1',
  userType: 'DEMOLITION_COMPANY',
  name: '양평철거',
  region: '전국',
  approvalStatus: 'APPROVED',
} as UserProfile;

describe('portOneCustomer — KG이니시스 구매자 정보', () => {
  it('이름은 항상, 휴대폰은 숫자만 넘긴다', () => {
    expect(portOneCustomer({ ...base, phone: '010-1234-5678' })).toEqual({
      customerId: 'u1',
      fullName: '양평철거',
      phoneNumber: '01012345678',
    });
  });

  it('소셜 로그인 이메일이 있으면 넘기고, 없으면 지어내지 않는다', () => {
    const withEmail = portOneCustomer({
      ...base,
      socialIdentities: [{ provider: 'kakao', providerUserId: 'k1', email: 'a@b.kr', linkedAt: '' }],
    });
    expect(withEmail.email).toBe('a@b.kr');
    expect(portOneCustomer(base)).not.toHaveProperty('email');
    expect(portOneCustomer(base)).not.toHaveProperty('phoneNumber');
  });

  it('프로필 이메일이 소셜 이메일보다 앞서고, 막 입력받은 값이 가장 앞선다', () => {
    const user = {
      ...base,
      email: 'profile@b.kr',
      socialIdentities: [{ provider: 'kakao' as const, providerUserId: 'k1', email: 'social@b.kr', linkedAt: '' }],
    };
    expect(knownEmail(user)).toBe('profile@b.kr');
    expect(portOneCustomer(user, 'typed@b.kr').email).toBe('typed@b.kr');
  });
});
