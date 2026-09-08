import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { SALES_PRODUCTS, oneTimeProducts, monthlySubscriptionProducts } from '@dimol/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortOneClient } from '../payment/portone-client.js';
import { SubscriptionStore } from '../subscriptions/store.js';
import { createProductRouter } from './products.js';

/**
 * 실판매 상품 — PG 심사 대상 경로.
 *
 * 심사 요건을 코드로 못 박는다: 정기결제는 월 단위만, 일반결제는 서비스 제공기간 명시,
 * 금액 권위는 서버 상품가(앱이 보낸 금액을 믿지 않는다), 빌링키는 응답에 없다.
 */

let server: Server | undefined;
let base: string;
let subscriptions: SubscriptionStore;
let getPayment: ReturnType<typeof vi.fn>;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

beforeEach(async () => {
  subscriptions = new SubscriptionStore();
  getPayment = vi.fn();
  const portone = new PortOneClient(
    { baseUrl: 'https://x', mode: 'test', allowLive: false, apiSecret: 'test' },
    {
      getPayment: getPayment as never,
      cancelPayment: vi.fn(),
    },
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as { authUser?: unknown }).authUser = { id: 'user-1' };
    next();
  });
  app.use('/api', createProductRouter(subscriptions, portone));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('상품 카탈로그 — 심사 요건', () => {
  it('일반결제 1건 · 월 정기결제 1건이 있다', () => {
    expect(oneTimeProducts()).toHaveLength(1);
    expect(monthlySubscriptionProducts()).toHaveLength(1);
  });

  it('일반결제 상품은 서비스 제공기간이 명시돼 있다 — 심사 필수', () => {
    for (const p of oneTimeProducts()) {
      expect(p.servicePeriod.label.length).toBeGreaterThan(0);
      expect(p.servicePeriod.hours).toBeGreaterThan(0);
    }
  });

  it('정기결제는 월 단위만이고 해지 안내가 있다', () => {
    for (const p of monthlySubscriptionProducts()) {
      expect(p.intervalMonths).toBe(1);
      expect(p.cancellationNotice.length).toBeGreaterThan(0);
    }
  });

  it('목록은 로그인 없이도 조회된다 — 심사자가 먼저 본다', async () => {
    const res = await fetch(`${base}/api/products`);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(SALES_PRODUCTS.length);
  });
});

describe('일반결제 — 금액 권위는 서버 상품가', () => {
  const product = oneTimeProducts()[0]!;

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
    const sub = monthlySubscriptionProducts()[0]!;
    const res = await post(`/api/products/${sub.id}/purchase`, { paymentId: 'pay_1' });
    expect(res.status).toBe(404);
  });

  it('paymentId 가 없으면 거부', async () => {
    const res = await post(`/api/products/${product.id}/purchase`, {});
    expect(res.status).toBe(400);
  });
});

describe('정기결제 — 빌링키 구독', () => {
  const product = monthlySubscriptionProducts()[0]!;

  it('빌링키로 구독을 만들고, 응답에 빌링키를 넣지 않는다', async () => {
    const res = await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_secret' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('ACTIVE');
    // 결제를 일으킬 수 있는 값이라 앱에 내려보내면 안 된다.
    expect(body.billingKey).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('bk_secret');
  });

  it('일반결제 상품은 정기결제 경로로 구독할 수 없다', async () => {
    const one = oneTimeProducts()[0]!;
    const res = await post(`/api/products/${one.id}/subscribe`, { billingKey: 'bk_1' });
    expect(res.status).toBe(404);
  });

  it('같은 상품을 두 번 구독할 수 없다 — 매달 두 번 청구된다', async () => {
    await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_1' });
    const res = await post(`/api/products/${product.id}/subscribe`, { billingKey: 'bk_2' });
    expect(res.status).toBe(400);
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
