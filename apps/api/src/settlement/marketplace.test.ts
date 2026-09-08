import { describe, expect, it } from 'vitest';
import {
  PLATFORM_FEE_RATE,
  calculateDeal,
  describeDealFee,
  payoutPartyForRequestKind,
} from '@dimol/shared';
import { buildDealSettlementPlan } from './plan.js';

/**
 * 마켓플레이스 거래 금액 — CLAUDE.md 상 유닛 테스트 필수 영역(금액·수수료·정산).
 *
 * 이 플랫폼의 돈은 두 다리로 흐른다: 소비자 → 철거업체, 철거업체 → 처리장.
 * 각 다리는 결제자 한 명·수취인 한 명이고, 플랫폼은 각 다리에서 수수료를 갖는다.
 */

describe('payoutPartyForRequestKind — 세금계산서 건명이 여기서 정해진다', () => {
  it('철거 요청의 수취인은 철거업체', () => {
    expect(payoutPartyForRequestKind('DEMOLITION')).toBe('DEMOLITION');
  });

  it('처리장 예약의 수취인은 처리장 — 철거업체가 결제자다', () => {
    expect(payoutPartyForRequestKind('DISPOSAL_RESERVATION')).toBe('DISPOSAL');
  });

  it('운반요청의 수취인은 운반업체', () => {
    expect(payoutPartyForRequestKind('TRANSPORT')).toBe('TRANSPORT');
  });
});

describe('calculateDeal — 수수료는 수취인 지급액에서 차감한다', () => {
  it('결제자가 내는 금액은 합의 금액 그대로다', () => {
    // 결제자에게 수수료를 더 받으면 화면 금액과 청구액이 달라진다.
    const deal = calculateDeal(10_000_000);
    expect(deal.payerAmount).toBe(10_000_000);
  });

  it('수수료 7% 를 떼고 나머지를 수취인에게 준다', () => {
    const deal = calculateDeal(10_000_000);
    expect(deal.platformFee).toBe(700_000);
    expect(deal.sellerPayout).toBe(9_300_000);
    // 반올림 오차로 돈이 새면 안 된다.
    expect(deal.platformFee + deal.sellerPayout).toBe(deal.payerAmount);
  });

  it('반올림해도 합계가 항상 맞는다', () => {
    for (const amount of [1, 7, 333, 12_345, 999_999, 1_000_003]) {
      const deal = calculateDeal(amount);
      expect(deal.platformFee + deal.sellerPayout).toBe(amount);
      expect(deal.sellerPayout).toBeGreaterThanOrEqual(0);
    }
  });

  it('0원 거래도 깨지지 않는다', () => {
    expect(calculateDeal(0)).toMatchObject({ payerAmount: 0, platformFee: 0, sellerPayout: 0 });
  });

  it('음수는 거부한다', () => {
    expect(() => calculateDeal(-1)).toThrow();
  });

  it('수수료율은 공유 상수를 쓴다 — 하드코딩 금지', () => {
    expect(calculateDeal(1_000_000).feeRate).toBe(PLATFORM_FEE_RATE);
  });
});

describe('buildDealSettlementPlan — 수취인이 한 명인 거래', () => {
  const plan = (party: 'DEMOLITION' | 'DISPOSAL' | 'TRANSPORT') =>
    buildDealSettlementPlan({
      amount: 10_000_000,
      party,
      completedDate: '2026-09-08',
      sellerBusinessNumber: '1208147521',
    });

  it('지급 지시가 하나뿐이다 — 받는 사람이 한 명이니까', () => {
    const result = plan('DEMOLITION');
    expect(result.payouts).toHaveLength(1);
    expect(result.payouts[0]?.party).toBe('DEMOLITION');
    expect(result.payouts[0]?.amount).toBe(9_300_000);
  });

  it('철거 거래의 party 가 DEMOLITION 이다 — 예전엔 TRANSPORT 로 찍혔다', () => {
    expect(plan('DEMOLITION').payouts[0]?.party).toBe('DEMOLITION');
  });

  it('처리장 거래의 party 가 DISPOSAL 이다', () => {
    expect(plan('DISPOSAL').payouts[0]?.party).toBe('DISPOSAL');
  });

  it('결제자가 내는 금액은 합의 금액과 같다', () => {
    expect(plan('DEMOLITION').prepaymentAmount).toBe(10_000_000);
  });

  it('정산일은 D+1 영업일이다', () => {
    // 2026-09-08 은 화요일 → 다음 영업일 수요일.
    expect(plan('DEMOLITION').settlementDate).toBe('2026-09-09');
  });

  it('금액 0짜리 유령 지급을 만들지 않는다', () => {
    for (const party of ['DEMOLITION', 'DISPOSAL', 'TRANSPORT'] as const) {
      expect(plan(party).payouts.every((p) => p.amount > 0)).toBe(true);
    }
  });
});

describe('describeDealFee — 수수료를 숨기지 않는다', () => {
  it('결제 금액·수수료율·수수료액을 모두 밝힌다', () => {
    const text = describeDealFee(calculateDeal(10_000_000));
    expect(text).toContain('10,000,000원');
    expect(text).toContain('7%');
    expect(text).toContain('700,000원');
    expect(text).toContain('정산액에서 차감');
  });
});
