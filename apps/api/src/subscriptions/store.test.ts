import { describe, expect, it } from 'vitest';
import { addOneMonth, isBillingDue, type Subscription } from '@dimol/shared';
import { SubscriptionStore, kstToday } from './store.js';

/**
 * 정기결제 — 돈이 매달 자동으로 빠져나가는 경로라 경계를 못 박는다.
 * 이중청구·영구 미재시도·해지 후 청구가 여기서 나오는 사고다.
 */

describe('addOneMonth — 말일 처리', () => {
  it('보통 달은 같은 날', () => {
    expect(addOneMonth('2026-09-08')).toBe('2026-10-08');
  });

  it('다음 달에 같은 날이 없으면 마지막 날로 맞춘다', () => {
    // 그냥 30일을 더하면 3/3 으로 밀려 결제일이 달마다 어긋난다.
    expect(addOneMonth('2026-01-31')).toBe('2026-02-28');
    expect(addOneMonth('2024-01-31')).toBe('2024-02-29');
  });

  it('연말을 넘긴다', () => {
    expect(addOneMonth('2026-12-15')).toBe('2027-01-15');
  });
});

describe('isBillingDue', () => {
  const base: Subscription = {
    id: 's1',
    userId: 'u1',
    productId: 'provider-membership',
    status: 'ACTIVE',
    billingKey: 'bk_1',
    nextBillingDate: '2026-09-08',
    currentPeriodEnd: '2026-09-08',
    startedAt: '2026-08-08',
  };

  it('결제일이 지났으면 대상', () => {
    expect(isBillingDue(base, '2026-09-08')).toBe(true);
    expect(isBillingDue(base, '2026-09-09')).toBe(true);
  });

  it('아직이면 대상이 아니다', () => {
    expect(isBillingDue(base, '2026-09-07')).toBe(false);
  });

  it('해지된 구독은 청구하지 않는다', () => {
    expect(isBillingDue({ ...base, status: 'CANCELLED' }, '2026-09-09')).toBe(false);
  });

  it('실패한 구독은 다시 시도한다 — 빼면 영영 재시도되지 않는다', () => {
    expect(isBillingDue({ ...base, status: 'PAYMENT_FAILED' }, '2026-09-09')).toBe(true);
  });
});

describe('SubscriptionStore', () => {
  it('구독을 만들면 다음 결제일이 한 달 뒤로 잡힌다', async () => {
    const store = new SubscriptionStore();
    const sub = await store.create({
      userId: 'u1',
      productId: 'provider-membership',
      billingKey: 'bk_1',
      startDate: '2026-09-08',
    });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.nextBillingDate).toBe('2026-10-08');
  });

  it('같은 상품을 두 번 구독할 수 없다 — 매달 두 번 청구된다', async () => {
    const store = new SubscriptionStore();
    const input = { userId: 'u1', productId: 'provider-membership', billingKey: 'bk_1' };
    await store.create(input);
    await expect(store.create(input)).rejects.toThrow('이미 구독 중');
  });

  it('정기결제 상품이 아니면 거부', async () => {
    const store = new SubscriptionStore();
    await expect(
      store.create({ userId: 'u1', productId: 'vision-report', billingKey: 'bk_1' }),
    ).rejects.toThrow('정기결제 상품이 아닙니다');
  });

  it('빌링키가 없으면 거부', async () => {
    const store = new SubscriptionStore();
    await expect(
      store.create({ userId: 'u1', productId: 'provider-membership', billingKey: '  ' }),
    ).rejects.toThrow('빌링키');
  });

  it('해지해도 이미 결제한 기간은 남는다', async () => {
    const store = new SubscriptionStore();
    const sub = await store.create({
      userId: 'u1',
      productId: 'provider-membership',
      billingKey: 'bk_1',
      startDate: '2026-09-08',
    });
    const cancelled = await store.cancel(sub.id, 'u1');
    expect(cancelled.status).toBe('CANCELLED');
    // 즉시 끊으면 낸 돈만큼을 못 쓰게 되어 환불 분쟁이 된다.
    expect(cancelled.currentPeriodEnd).toBe('2026-10-08');
    // 해지 후에는 청구 대상이 아니다.
    expect(await store.listDue('2026-11-01')).toHaveLength(0);
  });

  it('남의 구독은 해지할 수 없다', async () => {
    const store = new SubscriptionStore();
    const sub = await store.create({
      userId: 'u1',
      productId: 'provider-membership',
      billingKey: 'bk_1',
    });
    await expect(store.cancel(sub.id, 'u2')).rejects.toThrow('본인 구독만');
  });

  it('결제 성공하면 다음 달로 넘어간다', async () => {
    const store = new SubscriptionStore();
    const sub = await store.create({
      userId: 'u1',
      productId: 'provider-membership',
      billingKey: 'bk_1',
      startDate: '2026-09-08',
    });
    const charged = await store.markCharged(sub.id);
    expect(charged?.nextBillingDate).toBe('2026-11-08');
    expect(charged?.status).toBe('ACTIVE');
  });

  it('결제 실패해도 결제일은 그대로 — 다음 주기에 재시도한다', async () => {
    const store = new SubscriptionStore();
    const sub = await store.create({
      userId: 'u1',
      productId: 'provider-membership',
      billingKey: 'bk_1',
      startDate: '2026-09-08',
    });
    const failed = await store.markFailed(sub.id, 'CARD_DECLINED');
    expect(failed?.status).toBe('PAYMENT_FAILED');
    expect(failed?.nextBillingDate).toBe('2026-10-08');
    expect(await store.listDue('2026-10-09')).toHaveLength(1);
  });

  it('kstToday 는 한국 날짜를 낸다', () => {
    expect(kstToday(new Date('2026-09-07T16:00:00Z'))).toBe('2026-09-08');
  });
});
