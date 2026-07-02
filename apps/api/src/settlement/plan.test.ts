import { buildKoreanHolidaySet } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { buildSettlementPlan } from './plan.js';
import { calculateSettlementDate } from './settlement-date.js';

describe('calculateSettlementDate (D+1 영업일)', () => {
  it('목요일 완료 → 익영업일 금요일', () => {
    expect(calculateSettlementDate('2026-01-08')).toBe('2026-01-09');
  });

  it('금요일 완료 → 주말 건너뛰고 월요일', () => {
    expect(calculateSettlementDate('2026-01-09')).toBe('2026-01-12');
  });

  it('익영업일이 공휴일이면 순연', () => {
    // 금(01-09) 완료 → 월(01-12)이 공휴일이면 화(01-13)
    expect(calculateSettlementDate('2026-01-09', new Set(['2026-01-12']))).toBe('2026-01-13');
  });

  it('신정(고정 공휴일)에 걸리면 순연 — 12/31 완료 → 1/2', () => {
    const holidays = buildKoreanHolidaySet([2026]); // 2026-01-01 포함
    // 2025-12-31(수) +1영업일 → 신정(목) 건너뜀 → 1/2(금)
    expect(calculateSettlementDate('2025-12-31', holidays)).toBe('2026-01-02');
  });
});

describe('buildSettlementPlan', () => {
  it('수수료 7% 차감 + 정산일 + 셀러별 지급 지시를 묶는다', () => {
    const plan = buildSettlementPlan({
      transportFee: 100_000,
      disposalFee: 50_000,
      completedDate: '2026-01-08',
      transportBusinessNumber: '220-81-62517',
      disposalBusinessNumber: '220-81-62517',
    });

    expect(plan.breakdown.platformFee).toBe(10_500); // 150,000 * 0.07
    expect(plan.prepaymentAmount).toBe(150_000); // 선결제 = 운반비 + 처리비
    expect(plan.settlementDate).toBe('2026-01-09'); // 목 → 익영업일 금

    const transport = plan.payouts.find((p) => p.party === 'TRANSPORT');
    const disposal = plan.payouts.find((p) => p.party === 'DISPOSAL');
    expect(transport?.amount).toBe(93_000);
    expect(disposal?.amount).toBe(46_500);
    expect(transport?.businessNumber).toBe('220-81-62517');
  });

  it('지급 지시 합계는 정산 총액과 정확히 일치(불변식)', () => {
    const plan = buildSettlementPlan({
      transportFee: 33_333,
      disposalFee: 33_334,
      completedDate: '2026-01-08',
    });
    const sum = plan.payouts.reduce((acc, p) => acc + p.amount, 0);
    expect(sum).toBe(plan.breakdown.totalPayout);
  });

  it('공휴일을 주입하면 정산일이 순연된다', () => {
    const plan = buildSettlementPlan({
      transportFee: 10_000,
      disposalFee: 0,
      completedDate: '2026-01-09', // 금
      holidays: new Set(['2026-01-12']), // 월 공휴일
    });
    expect(plan.settlementDate).toBe('2026-01-13'); // 화
  });
});
