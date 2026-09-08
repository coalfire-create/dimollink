import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnomalyDetector } from '../anomaly/detect.js';
import { OfferStore } from '../offers/store.js';
import { PricingStore } from '../pricing/store.js';
import { QuoteStore } from '../quotes/store.js';
import { RequestStore } from '../requests/store.js';
import { ReviewStore } from '../reviews/store.js';
import { UserStore } from '../users/store.js';
import { createAdminRouter } from './admin.js';

const ADMIN = 'test-admin-token';

let server: Server;
let base: string;
let requestStore: RequestStore;
let quoteStore: QuoteStore;
let pricingStore: PricingStore;
let userStore: UserStore;

beforeEach(async () => {
  requestStore = new RequestStore();
  quoteStore = new QuoteStore(requestStore);
  pricingStore = new PricingStore();
  userStore = new UserStore();
  const reviewStore = new ReviewStore(requestStore);
  const offerStore = new OfferStore(requestStore);
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createAdminRouter(
      {
        userStore,
        reviewStore,
        requestStore,
        offerStore,
        anomalyDetector: new AnomalyDetector(requestStore, quoteStore),
        quoteStore,
        pricingStore,
      },
      ADMIN,
    ),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

const get = (path: string, token = ADMIN) =>
  fetch(`${base}${path}`, { headers: { 'x-admin-token': token } }).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  }));

function transportReq(items: { material: string; kg: number }[]) {
  return requestStore.create({
    kind: 'TRANSPORT',
    requesterId: 'd-1',
    region: PILOT.region,
    wasteCategory: PILOT.wasteCategory,
    wasteItems: items as never,
    allbaroRequested: false,
    loadAddress: '상차',
    unloadAddress: '하차',
  });
}

describe('백오피스 확장 현황', () => {
  it('소재별 kg 집계(waste-materials)', async () => {
    await transportReq([
      { material: 'REINFORCED_CONCRETE', kg: 4000 },
      { material: 'WOOD', kg: 1000 },
    ]);
    await transportReq([{ material: 'REINFORCED_CONCRETE', kg: 2000 }]);
    const { body } = await get('/api/admin/waste-materials');
    const concrete = body.find((r: { material: string }) => r.material === 'REINFORCED_CONCRETE');
    expect(concrete.totalKg).toBe(6000);
    expect(concrete.itemCount).toBe(2);
    expect(concrete.label).toBe('철근콘크리트');
  });

  it('밀봉 견적 현황은 건수만(금액 없음)', async () => {
    const req = await transportReq([{ material: 'WOOD', kg: 500 }]);
    await quoteStore.createQuote({ requestId: req.id, providerId: 't-1', party: 'TRANSPORT', amount: 100000 });
    await quoteStore.createQuote({ requestId: req.id, providerId: 't-2', party: 'TRANSPORT', amount: 120000 });
    const { body } = await get('/api/admin/quotes-summary');
    expect(body[0]).toEqual({ requestId: req.id, quoteCount: 2 });
    expect(JSON.stringify(body)).not.toContain('amount');
  });

  it('단가 설정 현황', async () => {
    await pricingStore.set('u-1', 25000);
    const { body } = await get('/api/admin/pricing');
    expect(body[0].userId).toBe('u-1');
    expect(body[0].unitPrice).toBe(25000);
  });

  it('토큰 불일치는 401', async () => {
    const { status } = await get('/api/admin/pricing', 'wrong');
    expect(status).toBe(401);
  });
});

describe('PATCH /api/admin/users/:id/role — 관리자 지정(부트스트랩)', () => {
  it('공유 토큰으로 첫 관리자를 만들 수 있다', async () => {
    const target = await userStore.create({
      userType: 'CONSUMER',
      name: '운영자',
      region: '양평',
      phone: '01099998888',
    });
    const res = await fetch(`${base}/api/admin/users/${target.id}/role`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('ADMIN');
  });

  it('role 값이 이상하면 400', async () => {
    const res = await fetch(`${base}/api/admin/users/whatever/role`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN },
      body: JSON.stringify({ role: 'SUPERUSER' }),
    });
    expect(res.status).toBe(400);
  });

  it('토큰 없이는 막는다', async () => {
    const res = await fetch(`${base}/api/admin/users/x/role`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/requests/:id/status — 멈춘 요청 개입', () => {
  /** IN_PROGRESS 까지 진행된 요청(업체가 잠수한 상황을 만든다). */
  async function stuckRequest() {
    const r = await requestStore.create({
      kind: 'TRANSPORT',
      requesterId: 'u1',
      region: '양평',
      wasteCategory: 'CONSTRUCTION',
      wasteTons: 5,
      loadAddress: 'a',
      unloadAddress: 'b',
    } as never);
    await requestStore.changeStatus(r.id, 'MATCHED', { matchedProviderId: 'p1' });
    await requestStore.changeStatus(r.id, 'PAID');
    await requestStore.changeStatus(r.id, 'IN_PROGRESS');
    return r.id;
  }

  const patch = (id: string, body: unknown) =>
    fetch(`${base}/api/admin/requests/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN },
      body: JSON.stringify(body),
    });

  it('정상 전이로는 갈 수 없는 곳으로 보낼 수 있다 — 이게 개입의 목적이다', async () => {
    const id = await stuckRequest();
    // IN_PROGRESS → CANCELLED 는 일반 규칙상 불가(작업 시작 후 취소 불가).
    const res = await patch(id, { status: 'CANCELLED', reason: '업체 연락두절 3일' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('CANCELLED');
    expect(body.cancelReason).toBe('업체 연락두절 3일');
  });

  it('사유가 없으면 거부한다 — 사유 없는 개입은 나중에 설명할 수 없다', async () => {
    const id = await stuckRequest();
    expect((await patch(id, { status: 'CANCELLED' })).status).toBe(400);
    expect((await patch(id, { status: 'CANCELLED', reason: '   ' })).status).toBe(400);
  });

  it('정산완료는 되돌릴 수 없다 — 돈이 이미 나갔다', async () => {
    const id = await stuckRequest();
    await requestStore.changeStatus(id, 'COMPLETED');
    await requestStore.changeStatus(id, 'SETTLED');
    const res = await patch(id, { status: 'IN_PROGRESS', reason: '되돌리기 시도' });
    expect(res.status).toBe(400);
  });

  it('알 수 없는 상태는 거부한다', async () => {
    const id = await stuckRequest();
    expect((await patch(id, { status: 'WHATEVER', reason: 'x' })).status).toBe(400);
  });

  it('토큰 없이는 막는다', async () => {
    const id = await stuckRequest();
    const res = await fetch(`${base}/api/admin/requests/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED', reason: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});
