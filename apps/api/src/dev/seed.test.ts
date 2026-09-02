import { isValidBusinessNumber } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { TEST_ACCOUNTS } from './seed.js';

/**
 * 시드 계정은 기동 시 조용히 실패해도 서버가 뜨기 때문에 눈에 잘 띄지 않는다.
 * 실제로 업체 계정 3개가 체크섬을 통과하지 못해 오랫동안 생성되지 않고 있었다
 * (앞 계정의 끝자리만 +1 해서 만든 값이라 국세청 체크섬이 깨졌다).
 */
describe('테스트 계정 시드', () => {
  it('사업자등록번호가 모두 국세청 체크섬을 통과한다', () => {
    const invalid = TEST_ACCOUNTS.filter(
      (a) => a.businessNumber && !isValidBusinessNumber(a.businessNumber),
    ).map((a) => `${a.name}(${a.businessNumber})`);
    expect(invalid).toEqual([]);
  });

  it('사업자등록번호가 계정끼리 겹치지 않는다', () => {
    const numbers = TEST_ACCOUNTS.map((a) => a.businessNumber).filter(Boolean);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('휴대폰번호가 계정끼리 겹치지 않는다', () => {
    const phones = TEST_ACCOUNTS.map((a) => a.phone);
    expect(new Set(phones).size).toBe(phones.length);
  });

  it('업체 유형에는 사업자등록번호가 있다', () => {
    const missing = TEST_ACCOUNTS.filter(
      (a) => a.userType !== 'CONSUMER' && a.userType !== 'INTERIOR_COMPANY' && !a.businessNumber,
    ).map((a) => a.name);
    expect(missing).toEqual([]);
  });
});
