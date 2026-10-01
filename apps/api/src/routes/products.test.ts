import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  DEMOLITION_MEMBERSHIP_ID,
  MAX_SERVICE_PERIOD_MONTHS,
  MEMBERSHIP_PASS_DAYS,
  SALES_PRODUCTS,
  findSalesProduct,
  monthlySubscriptionProducts,
  validateSalesProduct,
  type MonthlySubscriptionProduct,
  type OneTimeProduct,
  type SalesProduct,
  type UserType,
} from '@dimol/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortOneClient } from '../payment/portone-client.js';
import { PassStore } from '../subscriptions/pass-store.js';
import { SubscriptionStore } from '../subscriptions/store.js';
import { createProductRouter } from './products.js';

/**
 * 실판매 상품 — PG 심사 대상 경로.
 *
 * 심사 요건을 코드로 못 박는다: 서비스 제공기간·환불 정책 명시, 금액 권위는 서버 상품가
 * (앱이 보낸 금액을 믿지 않는다), 이용권은 결제가 확인된 뒤에만·한 결제에 한 번만 생긴다.
 */

const membership = findSalesProduct(DEMOLITION_MEMBERSHIP_ID) as OneTimeProduct;

/**
 * 정기결제 경로 검증용 고정 상품. 지금 파는 정기결제 상품은 없지만(멤버십은 30일 이용권
 * 단건결제로 전환), 경로는 남아 있으므로 빌링 채널·첫 달 청구 규칙을 계속 지킨다.
 */
const FIXTURE_MONTHLY: MonthlySubscriptionProduct = {
  id: 'fixture-monthly',
  billingType: 'MONTHLY_SUBSCRIPTION',
  name: '테스트 구독',
  description: '테스트',
  price: 5_900,
  imagePath: '/product-images/x.png',
  intervalMonths: 1,
  cancellationNotice: '언제든 해지',
  servicePeriod: { label: '1개월', hours: 720 },
  delivery: '배송 없음',
  refundPolicy: ['7일 내 미사용 시 전액 환불'],
  availableTo: ['DEMOLITION_COMPANY'],
  benefits: [],
};
const CATALOG: readonly SalesProduct[] = [...SALES_PRODUCTS, FIXTURE_MONTHLY];

let server: Server | undefined;
let base: string;
let subscriptions: SubscriptionStore;
let passes: PassStore;
let getPayment: ReturnType<typeof vi.fn>;
let payWithBillingKey: ReturnType<typeof vi.fn>;
let currentUser: { id: string; userType: UserType };

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
  subscriptions = new SubscriptionStore(undefined, (id) => CATALOG.find((p) => p.id === id));
  passes = new PassStore();
  currentUser = { id: 'user-1', userType: options.userType ?? 'DEMOLITION_COMPANY' };
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
    (req as { authUser?: unknown }).authUser = currentUser;
    next();
  });
  app.use(
    '/api',
    createProductRouter(subscriptions, portone, {
      billingEnabled: options.billingEnabled,
      catalog: CATALOG,
      passes,
      membership: { memberIdsOn: async () => options.memberIds ?? [] },
    }),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  await start({ billingEnabled: false });
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** PortOne 조회 결과를 "결제 완료, 상품가"로 둔다. */
const paid = (amount = membership.price) =>
  getPayment.mockResolvedValue({ status: 'PAID', amount: { total: amount } });

describe('상품 카탈로그 — 심사 요건', () => {
  it('판매 상품은 철거업체 멤버십 30일 이용권(단건결제 5,900원) 하나다', () => {
    expect(SALES_PRODUCTS.map((p) => p.id)).toEqual([DEMOLITION_MEMBERSHIP_ID]);
    expect(membership.billingType).toBe('ONE_TIME');
    expect(membership.price).toBe(5_900);
    expect(membership.grantsDays).toBe(30);
    expect(monthlySubscriptionProducts()).toHaveLength(0);
  });

  it('철거업체 전용이고 세 가지 혜택·자동 결제 없음을 안내한다', () => {
    expect(membership.availableTo).toEqual(['DEMOLITION_COMPANY']);
    const benefits = membership.benefits.join('\n');
    expect(benefits).toContain('우선 알림');
    expect(benefits).toContain('7% → 5%');
    expect(benefits).toContain('상단 노출');
    expect(membership.servicePeriod.label).toContain('자동 결제 없음');
  });

  it('모든 상품이 이미지·금액·상세·제공기간·배송·환불 정책을 갖췄다', () => {
    for (const p of SALES_PRODUCTS) {
      expect(validateSalesProduct(p), p.id).toEqual([]);
    }
  });

  it(`제공기간이 ${MAX_SERVICE_PERIOD_MONTHS}개월을 넘는 상품은 위반으로 잡힌다`, () => {
    const tooLong = { ...membership, servicePeriod: { label: '13개월', hours: 13 * 30 * 24 } };
    expect(validateSalesProduct(tooLong).join()).toContain('12개월');
  });

  it('목록은 로그인 없이도 조회된다 — 심사자가 먼저 본다', async () => {
    const res = await fetch(`${base}/api/products`);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(CATALOG.length);
  });
});

describe('30일 이용권 구매 — 단건결제', () => {
  it('결제가 확인되면 오늘부터 30일 이용권이 생긴다', async () => {
    paid();
    const res = await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paid).toBe(true);
    expect(body.servicePeriod).toBe(membership.servicePeriod.label);
    const [pass] = await passes.listByUser('user-1');
    expect(pass!.paymentId).toBe('pay_1');
    expect(body.pass).toEqual({ startDate: pass!.startDate, endDate: pass!.endDate });
    const days = (Date.parse(pass!.endDate) - Date.parse(pass!.startDate)) / 86_400_000;
    expect(days).toBe(MEMBERSHIP_PASS_DAYS);
  });

  it('이용 중에 다시 사면 남은 기간 뒤로 30일이 이어진다', async () => {
    paid();
    const first = (
      await (await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' })).json()
    ).pass;
    const second = (
      await (await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_2' })).json()
    ).pass;
    expect(second.startDate).toBe(first.endDate);
    expect(await passes.listByUser('user-1')).toHaveLength(2);
  });

  it('같은 결제로 검증을 다시 요청해도 이용권은 하나다(재시도·재사용 방지)', async () => {
    paid();
    await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' });
    await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' });
    expect(await passes.listByUser('user-1')).toHaveLength(1);
  });

  it('다른 사람의 결제 id 로는 이용권을 받을 수 없다', async () => {
    paid();
    await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' });
    currentUser = { id: 'user-2', userType: 'DEMOLITION_COMPANY' };
    const res = await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' });
    expect(res.status).toBe(409);
    expect(await passes.listByUser('user-2')).toHaveLength(0);
  });

  it('결제액이 상품가와 다르면 거부하고 이용권을 만들지 않는다', async () => {
    paid(100);
    const res = await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' });
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('AMOUNT_MISMATCH');
    expect(await passes.listAll()).toHaveLength(0);
  });

  it('입금 대기(가상계좌 발급만 됨)면 이용권을 만들지 않는다', async () => {
    getPayment.mockResolvedValue({
      status: 'VIRTUAL_ACCOUNT_ISSUED',
      amount: { total: membership.price },
    });
    const res = await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' });
    expect((await res.json()).paid).toBe(false);
    expect(await passes.listAll()).toHaveLength(0);
  });

  it('철거업체가 아니면 결제 확인 전에 거절한다', async () => {
    for (const userType of ['CONSUMER', 'TRANSPORT_COMPANY', 'WASTE_TREATMENT_PLANT'] as const) {
      currentUser = { id: 'user-x', userType };
      const res = await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_x' });
      expect(res.status, userType).toBe(403);
    }
    expect(getPayment).not.toHaveBeenCalled();
  });

  it('paymentId 가 없으면 거부', async () => {
    const res = await post(`/api/products/${membership.id}/purchase`, {});
    expect(res.status).toBe(400);
  });

  it('내 이용권 목록 — 최근 종료일 순', async () => {
    paid();
    await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_1' });
    await post(`/api/products/${membership.id}/purchase`, { paymentId: 'pay_2' });
    const list = (await (await fetch(`${base}/api/membership-passes`)).json()) as {
      endDate: string;
    }[];
    expect(list).toHaveLength(2);
    expect(list[0]!.endDate > list[1]!.endDate).toBe(true);
  });
});

describe('정기결제 경로 — 현재 판매 상품 없음, 규칙만 유지', () => {
  it('빌링 채널이 없으면 409 로 막고 결제를 시도하지 않는다', async () => {
    const res = await post(`/api/products/${FIXTURE_MONTHLY.id}/subscribe`, { billingKey: 'bk_1' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('BILLING_UNAVAILABLE');
    expect(payWithBillingKey).not.toHaveBeenCalled();
  });

  it('빌링 채널이 있으면 첫 달을 바로 청구하고, 응답에 빌링키가 없다', async () => {
    await start({ billingEnabled: true });
    const res = await post(`/api/products/${FIXTURE_MONTHLY.id}/subscribe`, {
      billingKey: 'bk_secret',
    });
    expect(res.status).toBe(201);
    expect(payWithBillingKey).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await res.json())).not.toContain('bk_secret');
  });

  it('첫 달 결제가 실패하면 구독을 만들지 않는다', async () => {
    await start({ billingEnabled: true });
    payWithBillingKey.mockRejectedValueOnce(new Error('카드 한도 초과'));
    const res = await post(`/api/products/${FIXTURE_MONTHLY.id}/subscribe`, { billingKey: 'bk_1' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await subscriptions.listByUser('user-1')).toHaveLength(0);
  });

  it('단건결제 상품은 정기결제 경로로, 정기결제 상품은 단건 경로로 살 수 없다', async () => {
    await start({ billingEnabled: true });
    expect(
      (await post(`/api/products/${membership.id}/subscribe`, { billingKey: 'bk_1' })).status,
    ).toBe(404);
    expect(
      (await post(`/api/products/${FIXTURE_MONTHLY.id}/purchase`, { paymentId: 'p' })).status,
    ).toBe(404);
  });
});

describe('상단 노출 — 멤버십 업체 목록', () => {
  it('멤버십 회원 id 를 내려준다(로그인 불필요)', async () => {
    await start({ billingEnabled: false, memberIds: ['company-a', 'company-b'] });
    const res = await fetch(`${base}/api/products/featured-providers`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providerIds: ['company-a', 'company-b'] });
  });
});
