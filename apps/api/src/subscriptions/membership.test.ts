import {
  DEMOLITION_MEMBERSHIP_ID,
  MEMBER_PLATFORM_FEE_RATE,
  PLATFORM_FEE_RATE,
  subscriptionCoversDate,
  type Subscription,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { buildDealSettlementPlan } from '../settlement/plan.js';
import { MembershipService } from './membership.js';
import { SubscriptionStore } from './store.js';

/**
 * 철거업체 멤버십 혜택 판정 + 인하 수수료 정산 금액.
 * 금액 계산은 CLAUDE.md 규칙상 유닛 테스트 필수 영역이다.
 */

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 's-1',
    userId: 'demo-co',
    productId: DEMOLITION_MEMBERSHIP_ID,
    status: 'ACTIVE',
    billingKey: 'bk',
    // 2026-10-01 09:00 KST 시작, 11-01 까지 결제로 덮임.
    startedAt: '2026-10-01T00:00:00.000Z',
    nextBillingDate: '2026-11-01',
    currentPeriodEnd: '2026-11-01',
    ...overrides,
  };
}

/** 저장소에 구독을 직접 넣는다(구독 생성 경로는 products 라우트 테스트가 다룬다). */
async function storeWith(...subs: Subscription[]): Promise<SubscriptionStore> {
  const store = new SubscriptionStore();
  const inner = store as unknown as { fallbackMap: Map<string, Subscription> };
  for (const s of subs) inner.fallbackMap.set(s.id, s);
  return store;
}

describe('subscriptionCoversDate — 결제로 덮인 기간만 혜택', () => {
  it('시작일부터 종료일 전날까지 혜택', () => {
    expect(subscriptionCoversDate(sub(), '2026-10-01')).toBe(true);
    expect(subscriptionCoversDate(sub(), '2026-10-31')).toBe(true);
  });

  it('종료일 당일부터는 혜택 없음(다음 달 결제가 안 됐으면 끝난다)', () => {
    expect(subscriptionCoversDate(sub(), '2026-11-01')).toBe(false);
  });

  it('시작 전 날짜에는 혜택 없음', () => {
    expect(subscriptionCoversDate(sub(), '2026-09-30')).toBe(false);
  });

  it('시작 시각은 KST 기준 날짜로 본다(UTC 전날 밤 = KST 당일)', () => {
    const s = sub({ startedAt: '2026-09-30T16:00:00.000Z' }); // KST 10-01 01:00
    expect(subscriptionCoversDate(s, '2026-09-30')).toBe(false);
    expect(subscriptionCoversDate(s, '2026-10-01')).toBe(true);
  });

  it('해지해도 이미 결제한 기간은 혜택 유지', () => {
    expect(subscriptionCoversDate(sub({ status: 'CANCELLED' }), '2026-10-20')).toBe(true);
  });
});

describe('MembershipService', () => {
  it('멤버십 구독이 기간 안이면 회원', async () => {
    const m = new MembershipService(await storeWith(sub()));
    expect(await m.isMemberOn('demo-co', '2026-10-15')).toBe(true);
    expect(await m.isMemberOn('demo-co', '2026-11-02')).toBe(false);
    expect(await m.isMemberOn('other', '2026-10-15')).toBe(false);
  });

  it('다른 상품 구독은 멤버십 혜택이 아니다', async () => {
    const m = new MembershipService(await storeWith(sub({ productId: 'something-else' })));
    expect(await m.isMemberOn('demo-co', '2026-10-15')).toBe(false);
  });

  it('회원 id 목록은 중복 없이 기간 안 회원만', async () => {
    const m = new MembershipService(
      await storeWith(
        sub({ id: 'a', userId: 'co-a' }),
        sub({ id: 'a2', userId: 'co-a', status: 'CANCELLED' }),
        sub({ id: 'b', userId: 'co-b', currentPeriodEnd: '2026-10-05' }),
      ),
    );
    expect(await m.memberIdsOn('2026-10-15')).toEqual(['co-a']);
  });

  it('수수료율: 회원 5%, 비회원 7% — 처리완료일 기준', async () => {
    const m = new MembershipService(await storeWith(sub()));
    expect(await m.feeRateFor('demo-co', '2026-10-15')).toBe(MEMBER_PLATFORM_FEE_RATE);
    expect(await m.feeRateFor('demo-co', '2026-11-15')).toBe(PLATFORM_FEE_RATE);
    expect(await m.feeRateFor('other', '2026-10-15')).toBe(PLATFORM_FEE_RATE);
    expect(MEMBER_PLATFORM_FEE_RATE).toBe(0.05);
    expect(PLATFORM_FEE_RATE).toBe(0.07);
  });
});

describe('인하 수수료 정산 금액', () => {
  const base = { amount: 1_000_000, party: 'DEMOLITION' as const, completedDate: '2026-10-15' };

  it('회원(5%): 수수료 50,000원 · 업체 지급 950,000원', () => {
    const plan = buildDealSettlementPlan({ ...base, feeRate: MEMBER_PLATFORM_FEE_RATE });
    expect(plan.breakdown.platformFee).toBe(50_000);
    expect(plan.payouts).toEqual([
      { party: 'DEMOLITION', amount: 950_000, businessNumber: undefined },
    ]);
    // 결제자가 낸 금액은 회원 여부와 무관하게 같다.
    expect(plan.prepaymentAmount).toBe(1_000_000);
  });

  it('비회원(기본 7%): 수수료 70,000원 · 업체 지급 930,000원', () => {
    const plan = buildDealSettlementPlan(base);
    expect(plan.breakdown.platformFee).toBe(70_000);
    expect(plan.payouts[0]!.amount).toBe(930_000);
  });

  it('반올림: 1,234,567원 × 5% = 61,728원, 지급 + 수수료 = 결제액', () => {
    const plan = buildDealSettlementPlan({
      ...base,
      amount: 1_234_567,
      feeRate: MEMBER_PLATFORM_FEE_RATE,
    });
    expect(plan.breakdown.platformFee).toBe(61_728);
    expect(plan.payouts[0]!.amount + plan.breakdown.platformFee).toBe(1_234_567);
  });
});
