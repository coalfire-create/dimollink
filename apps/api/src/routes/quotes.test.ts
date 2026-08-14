import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { createRequireAuth } from '../middleware/auth.js';
import { QuoteStore } from '../quotes/store.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createQuotesRouter } from './quotes.js';

// 체크섬 통과 사업자번호 (실존 업체와 무관).
const BIZ_A = '1208147521';
const BIZ_B = '1234567891';
const BIZ_C = '1000000009';

let server: Server;
let base: string;
let requestStore: RequestStore;
let quoteStore: QuoteStore;
let userStore: UserStore;
let sessionStore: SessionTokenStore;

const tokenOf = (userId: string) => sessionStore.issue(userId);

beforeEach(async () => {
  requestStore = new RequestStore();
  quoteStore = new QuoteStore(requestStore);
  userStore = new UserStore();
  sessionStore = new SessionTokenStore();
  const app = express();
  app.use(express.json());
  app.use('/api/quotes', createRequireAuth(sessionStore, userStore));
  app.use('/api', createQuotesRouter(quoteStore, userStore, requestStore));
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

function makeCompany(
  userType: 'DEMOLITION_COMPANY' | 'TRANSPORT_COMPANY',
  phone: string,
  biz: string,
) {
  const u = userStore.create({ userType, name: '업체', region: PILOT.region, phone, businessNumber: biz });
  userStore.setApprovalStatus(u.id, 'APPROVED');
  return u;
}

function makeConsumer(phone: string) {
  return userStore.create({ userType: 'CONSUMER', name: '소비자', region: PILOT.region, phone });
}

const getQuotes = (viewerId: string, query = '') =>
  fetch(`${base}/api/quotes${query}`, {
    headers: { authorization: `Bearer ${tokenOf(viewerId)}` },
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('견적 밀봉 접근제어 (GET /api/quotes)', () => {
  it('요청자(배출자)는 해당 요청의 모든 견적을 본다', async () => {
    const requester = makeCompany('DEMOLITION_COMPANY', '01020000001', BIZ_A);
    const tA = makeCompany('TRANSPORT_COMPANY', '01020000002', BIZ_B);
    const tB = makeCompany('TRANSPORT_COMPANY', '01020000003', BIZ_C);
    const req = requestStore.create({
      kind: 'TRANSPORT',
      requesterId: requester.id,
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      loadAddress: '상차지',
      unloadAddress: '하차지',
    });
    quoteStore.createQuote({ requestId: req.id, providerId: tA.id, party: 'TRANSPORT', amount: 100000 });
    quoteStore.createQuote({ requestId: req.id, providerId: tB.id, party: 'TRANSPORT', amount: 120000 });

    const { body } = await getQuotes(requester.id, `?requestId=${req.id}`);
    expect(body).toHaveLength(2);
  });

  it('업체는 자기가 제출한 견적만 본다 (경쟁사 금액 비공개)', async () => {
    const requester = makeCompany('DEMOLITION_COMPANY', '01020000001', BIZ_A);
    const tA = makeCompany('TRANSPORT_COMPANY', '01020000002', BIZ_B);
    const tB = makeCompany('TRANSPORT_COMPANY', '01020000003', BIZ_C);
    const req = requestStore.create({
      kind: 'TRANSPORT',
      requesterId: requester.id,
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      loadAddress: '상차지',
      unloadAddress: '하차지',
    });
    quoteStore.createQuote({ requestId: req.id, providerId: tA.id, party: 'TRANSPORT', amount: 100000 });
    quoteStore.createQuote({ requestId: req.id, providerId: tB.id, party: 'TRANSPORT', amount: 120000 });

    const { body } = await getQuotes(tA.id, `?requestId=${req.id}`);
    expect(body).toHaveLength(1);
    expect(body[0].providerId).toBe(tA.id);
    expect(body[0].amount).toBe(100000);
  });

  it('소비자(제3자)는 견적 금액을 전혀 볼 수 없다 (빈 목록)', async () => {
    const requester = makeCompany('DEMOLITION_COMPANY', '01020000001', BIZ_A);
    const tA = makeCompany('TRANSPORT_COMPANY', '01020000002', BIZ_B);
    const consumer = makeConsumer('01020000009');
    const req = requestStore.create({
      kind: 'TRANSPORT',
      requesterId: requester.id,
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      loadAddress: '상차지',
      unloadAddress: '하차지',
    });
    quoteStore.createQuote({ requestId: req.id, providerId: tA.id, party: 'TRANSPORT', amount: 100000 });

    const { body } = await getQuotes(consumer.id, `?requestId=${req.id}`);
    expect(body).toEqual([]);
  });

  it('requestId 없이 조회하면 본인이 제출한 견적만 반환 (업체)', async () => {
    const requester = makeCompany('DEMOLITION_COMPANY', '01020000001', BIZ_A);
    const tA = makeCompany('TRANSPORT_COMPANY', '01020000002', BIZ_B);
    const tB = makeCompany('TRANSPORT_COMPANY', '01020000003', BIZ_C);
    const req = requestStore.create({
      kind: 'TRANSPORT',
      requesterId: requester.id,
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      loadAddress: '상차지',
      unloadAddress: '하차지',
    });
    quoteStore.createQuote({ requestId: req.id, providerId: tA.id, party: 'TRANSPORT', amount: 100000 });
    quoteStore.createQuote({ requestId: req.id, providerId: tB.id, party: 'TRANSPORT', amount: 120000 });

    const { body } = await getQuotes(tB.id);
    expect(body).toHaveLength(1);
    expect(body[0].providerId).toBe(tB.id);
  });

  it('존재하지 않는 requestId 는 404', async () => {
    const tA = makeCompany('TRANSPORT_COMPANY', '01020000002', BIZ_B);
    const { status } = await getQuotes(tA.id, '?requestId=does-not-exist');
    expect(status).toBe(404);
  });
});
