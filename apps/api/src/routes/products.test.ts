import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  DEMOLITION_MEMBERSHIP_ID,
  MAX_SERVICE_PERIOD_MONTHS,
  SALES_PRODUCTS,
  findSalesProduct,
  monthlySubscriptionProducts,
  oneTimeProducts,
  validateSalesProduct,
  type OneTimeProduct,
  type SalesProduct,
  type UserType,
} from '@dimol/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortOneClient } from '../payment/portone-client.js';
import { SubscriptionStore } from '../subscriptions/store.js';
import { createProductRouter } from './products.js';

/**
 * 실판매 상품 — PG 심사 대상 경로.
 *
 * 심사 요건을 코드로 못 박는다: 정기결제는 월 단위만, 서비스 제공기간·환불 정책 명시,
 * 금액 권위는 서버 상품가(앱이 보낸 금액을 믿지 않는다), 빌링키는 응답에 없다.
 */

/**
 * 일반결제 경로 검증용 고정 상품. 지금 실제로 파는 일반결제 상품은 없지만(현장 분석
 * 리포트는 무료로 전환), 경로 자체는 살아 있으므로 금액 검증 규칙을 계속 지킨다.
 */
const FIXTURE_ONE_TIME: OneTimeProduct = {
  id: 'fixture-one-time',
  billingType: 'ONE_TIME',
  name: '테스트 상품',
  description: '테스트',
  price: 1_000,
  imagePath: '/product-images/x.png',
  servicePeriod: { label: '결제 후 24시간 이내', hours: 24 },
  delivery: '배송 없음',
  refundPolicy: ['제공 전 전액 환불'],
  benefits: [],
};
const CATALOG: readonly SalesProduct[] = [...SALES_PRODUCTS, FIXTURE_ONE_TIME];
const membershipProduct = findSalesProduct(DEMOLITION_MEMBERSHIP_ID)!;

let server: Server | undefined;
let base: string;
let subscriptions: SubscriptionStore;
let getPayment: ReturnType<typeof vi.fn>;
let payWithBillingKey: ReturnType<typeof vi.fn>;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

async function start(options: {
  billingEnabled: boolean;
  userType?: UserType;
  memberIds?: string[];
}) {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  subscriptions = new SubscriptionStore();
  getPayment = vi.fn();
  payWithBillingKey = vi.fn(async (input: { amount: { total: number } }) => ({
    payment: { status: 'PAID', amount: { total: input.amount.total } },
  }));
  const portone = new PortOneClient(
    { baseUrl: 'https://x', mode: 'test', allowLive: false, apiSecret: 'test' },
    {
      getPayment: getPayment as never,
      cancelPayment: vi.fn(),
      payWithBillingKey: payWithBillingKey as never,
    },
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { authUser?: unknown }).authUser = {
      id: 'user-1',
      userType: options.userType ?? 'DEMOLITION_COMPANY',
    };
    next();
  });
  app.use(
    '/api',
    createProductRouter(subscriptions, portone, {
      billingEnabled: options.billingEnabled,
      catalog: CATALOG,
      membership: { memberIdsOn: async () => options.memberIds ?? [] },
    }),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  await start({ billingEnabled: true });
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('상품 카탈로그 — 심사 요건', () => {
  it('판매 상품은 철거업체 멤버십(월 5,900원) 하나다 — 현장 분석 리포트는 무료 전환', () => {
    expect(SALES_PRODUCTS.map((p) => p.id)).toEqual([DEMOLITION_MEMBERSHIP_ID]);
    expect(membershipProduct.price).toBe(5_900);
    expect(oneTimeProducts()).toHaveLength(0);
    expect(findSalesProduct('vision-report')).toBeUndefined();
  });

  it('멤버십은 철거업체 전용이고 세 가지 혜택을 안내한다', () => {
    expect(membershipProduct.availableTo).toEqual(['DEMOLITION_COMPANY']);
    const benefits = membershipProduct.benefits.join('\n');
    expect(benefits).toContain('우선 알림');
    expect(benefits).toContain('7% → 5%');
    expect(benefits).toContain('상단 노출');
  });

  it('정기결제는 월 단위만이고 해지 안내가 있다', () => {
    for (const p of monthlySubscriptionProducts()) {
      expect(p.intervalMonths).toBe(1);
      expect(p.cancellationNotice.length).toBeGreaterThan(0);
    }
  });

  it('모든 상품이 이미지·금액·상세·제공기간·배송·환불 정책을 갖췄다', () => {
    for (const p of SALES_PRODUCTS) {
      expect(validateSalesProduct(p), p.id).toEqual([]);
    }
  });

  it(`제공기간이 ${MAX_SERVICE_PERIOD_MONTHS}개월을 넘는 상품은 위반으로 잡힌다`, () => {
    const tooLong = {
      ...FIXTURE_ONE_TIME,
      servicePeriod: { label: '13개월', hours: 13 * 30 * 24 },
    };
    expect(validateSalesProduct(tooLong).join()).toContain('12개월');
  });

  it('목록은 로그인 없이도 조회된다 — 심사자가 먼저 본다', async () => {
    const res = await fetch(`${base}/api/products`);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(CATALOG.length);
  });
});

describe('빌링 채널이 없을 때 — 상품은 보이고 결제만 막는다', () => {
  beforeEach(async () => {
    await start({ billingEnabled: false });
  });

  it('목록에는 정기결제 상품도 그대로 나온다', async () => {
    const body = (await (await fetch(`${base}/api/products`)).json()) as { id: string }[];
    expect(body.map((p) => p.id)).toContain(DEMOLITION_MEMBERSHIP_ID);
  });

  it('구독 경로는 409 로 막고, 결제를 시도하지 않는다', async () => {
    const res = await post(`/api/products/${DEMOLITION_MEMBERSHIP_ID}/subscribe`, {
      billingKey: 'bk_1',
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('BILLING_UNAVAILABLE');
    expect(payWithBillingKey).not.toHaveBeenCalled();
  });
});

describe('일반결제 — 금액 권위는 서버 상품가', () => {
  const product = FIXTURE_ONE_TIME;

  it('상품가와 결제액이 같으면 통과하고 서비스 제공기간을 돌려준다', async () => {
    getPayment.mockResolvedValue({ status: 'PAID', amount: { total: product.price } });
    const res = await post(`/api/products/${product.id}/purchase`, { paymentId: 'pay_1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paid).toBe(true);
    expect(body.servicePeriod).toBe(product.servicePeriod.label);
  });

  it('결제액이 상품가와 다르면 거부한다 — 앱이 금액을 바꿔도 막힌다', async () => {
    getPayment.mockResolvedValue({ status: 'PAID', amount: { total: 100 } });
    const res = await post(`/api/products/${product.id}/purchase`, { paymentId: 'pay_1' });
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('AMOUNT_MISMATCH');
  });

  it('정기결제 상품은 일반결제 경로로 살 수 없다 — 결제창이 다르다', async () => {
    const res = await post(`/api/products/${DEMOLITION_MEMBERSHIP_ID}/purchase`, {
      paymentId: 'pay_1',
    });
    expect(res.status).toBe(404);
  });

  it('paymentId 가 없으면 거부', async () => {
    const res = await post(`/api/products/${product.id}/purchase`, {});
    expect(res.status).toBe(400);
  });
});

describe('정기결제 — 철거업체 멤버십 구독', () => {
  const product = membershipProduct;

  it('빌링키로 구독을 만들고, 응답에 빌링키를 넣지 않는다', async () => {
    const res = await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_secret' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('ACTIVE');
    // 결제를 일으킬 수 있는 값이라 앱에 내려보내면 안 된다.
    expect(body.billingKey).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('bk_secret');
  });

  it('구독할 때 첫 달 5,900원을 바로 청구한다 — 안 하면 첫 달이 무료가 된다', async () => {
    const res = await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_1' });
    expect(res.status).toBe(201);
    expect(payWithBillingKey).toHaveBeenCalledTimes(1);
    const call = payWithBillingKey.mock.calls[0]![0] as {
      billingKey: string;
      amount: { total: number };
    };
    expect(call.billingKey).toBe('bk_1');
    expect(call.amount.total).toBe(5_900);
  });

  it('철거업체가 아니면 구독할 수 없고, 결제를 시도하지 않는다', async () => {
    for (const userType of ['CONSUMER', 'TRANSPORT_COMPANY', 'WASTE_TREATMENT_PLANT'] as const) {
      await start({ billingEnabled: true, userType });
      const res = await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_1' });
      expect(res.status, userType).toBe(403);
      expect(payWithBillingKey).not.toHaveBeenCalled();
    }
  });

  it('첫 달 결제가 실패하면 구독을 만들지 않는다', async () => {
    payWithBillingKey.mockRejectedValueOnce(new Error('카드 한도 초과'));
    const res = await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_1' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await subscriptions.listByUser('user-1')).toHaveLength(0);
  });

  it('이미 구독 중이면 결제 전에 거절한다 — 돈만 빠져나가지 않게', async () => {
    await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_1' });
    payWithBillingKey.mockClear();
    const res = await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_2' });
    expect(res.status).toBe(400);
    expect(payWithBillingKey).not.toHaveBeenCalled();
  });

  it('일반결제 상품은 정기결제 경로로 구독할 수 없다', async () => {
    const res = await post(`/api/products/${FIXTURE_ONE_TIME.id}/subscribe`, {
      billingKey: 'bk_1',
    });
    expect(res.status).toBe(404);
  });

  it('해지하면 다음 결제부터 청구되지 않는다', async () => {
    const created = await (
      await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_1' })
    ).json();
    const res = await post(`/api/subscriptions/${created.id}/cancel`, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('CANCELLED');
    // 이미 결제한 기간은 남는다.
    expect(body.currentPeriodEnd).toBe(created.currentPeriodEnd);
  });

  it('내 구독 목록에도 빌링키가 없다', async () => {
    await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_secret' });
    const res = await fetch(`${base}/api/subscriptions`);
    expect(JSON.stringify(await res.json())).not.toContain('bk_secret');
  });
});

describe('상단 노출 — 멤버십 업체 목록', () => {
  it('멤버십 회원 id 를 내려준다(로그인 불필요)', async () => {
    await start({ billingEnabled: true, memberIds: ['company-a', 'company-b'] });
    const res = await fetch(`${base}/api/products/featured-providers`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providerIds: ['company-a', 'company-b'] });
  });
});
