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
