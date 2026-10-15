import { describe, expect, it } from 'vitest';
import { MEMBER_PLATFORM_FEE_RATE, PLATFORM_FEE_RATE } from '@dimol/shared';
import { breakEvenSettlement, dailyPrice, feeSavings } from './membership-value';

describe('membership value', () => {
  it('하루 가격은 반올림 — 5,900원 / 30일 = 약 197원', () => {
    expect(dailyPrice(5_900, 30)).toBe(197);
  });

  it('아끼는 수수료는 실제 요율 차이로 계산한다', () => {
    const expected = Math.round(10_000_000 * (PLATFORM_FEE_RATE - MEMBER_PLATFORM_FEE_RATE));
    expect(feeSavings(10_000_000)).toBe(expected);
    // 지금 요율(7% → 5%)이면 1,000만 원 정산에 20만 원.
    expect(feeSavings(10_000_000)).toBe(200_000);
  });

  it('손익분기 정산액은 부동소수점 오차 없이 정확히 — 5,900원이면 29만 5천 원', () => {
    expect(breakEvenSettlement(5_900)).toBe(295_000);
  });

  it('손익분기 금액에서 아낀 수수료가 이용권 값 이상이다', () => {
    const be = breakEvenSettlement(5_900)!;
    expect(feeSavings(be)).toBeGreaterThanOrEqual(5_900);
    expect(feeSavings(be - 1_000)).toBeLessThan(5_900);
  });
});
