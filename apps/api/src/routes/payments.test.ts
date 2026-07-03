import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { createRequireAuth } from '../middleware/auth.js';
import { PaymentStore } from '../payment/payment-store.js';
import type { PaymentService } from '../payment/payment-service.js';
import { QuoteStore } from '../quotes/store.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createPaymentsRouter } from './payments.js';

let server: Server;
let base: string;
let requestStore: RequestStore;
let quoteStore: QuoteStore;
let paymentStore: PaymentStore;
let userStore: UserStore;
let sessionStore: SessionTokenStore;

// 포트원 호출을 대체하는 가짜 결제 서비스.
const fakeService = {
  prepay: async (_matchRequestId: string, plan: { prepaymentAmount: number }) => ({
    paymentId: 'pay-test',
    status: 'READY',
    amount: plan.prepaymentAmount,
    environment: 'sandbox',
  }),
  cancel: async () => ({
    breakdown: { stage: 'BEFORE_DISPATCH', cancellable: true, paidAmount: 0, penaltyAmount: 0, refundAmount: 0 },
  }),
  executePayouts: async () => [],
} as unknown as PaymentService;

beforeEach(async () => {
  requestStore = new RequestStore();
  userStore = new UserStore();
  sessionStore = new SessionTokenStore();
  quoteStore = new QuoteStore(requestStore);
  paymentStore = new PaymentStore();
  const app = express();
  app.use(express.json());
  const requireAuth = createRequireAuth(sessionStore, userStore);
  app.post('/api/payments/prepay', requireAuth);
  app.post('/api/payments/cancel', requireAuth);
  app.use('/api', createPaymentsRouter(fakeService, requestStore, quoteStore, paymentStore));
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

function makeUser(phone: string) {
  return userStore.create({ userType: 'CONSUMER', name: '배출자', region: PILOT.region, phone });
}
function makeRequest(requesterId: string) {
  return requestStore.create({
    kind: 'DEMOLITION',
    requesterId,
    region: PILOT.region,
    wasteCategory: PILOT.wasteCategory,
    wasteTons: 3,
    allbaroRequested: false,
    siteAddress: '양평읍 현장',
  });
}
function acceptQuote(requestId: string, requesterId: string, party: 'TRANSPORT' | 'DISPOSAL', amount: number) {
  const q = quoteStore.createQuote({ requestId, providerId: `${party}-p`, party, amount });
  quoteStore.accept(q.id, requesterId);
}
const post = (path: string, token: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('선결제 — 금액 권위(수락 견적 기준)', () => {
  it('수락된 견적이 없으면 409(NO_ACCEPTED_QUOTE)', async () => {
    const owner = makeUser('01060000001');
    const request = makeRequest(owner.id);
    const res = await post('/api/payments/prepay', sessionStore.issue(owner.id), {
      matchRequestId: request.id,
      completedDate: '2026-07-10',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_ACCEPTED_QUOTE');
  });

  it('선결제 금액은 클라이언트 입력이 아닌 수락 견적에서 산출된다', async () => {
    const owner = makeUser('01060000002');
    const request = makeRequest(owner.id);
    acceptQuote(request.id, owner.id, 'TRANSPORT', 120000);
    acceptQuote(request.id, owner.id, 'DISPOSAL', 80000);

    const res = await post('/api/payments/prepay', sessionStore.issue(owner.id), {
      matchRequestId: request.id,
      completedDate: '2026-07-10',
      transportFee: 999999, // 조작 시도 — 무시되어야 함
      disposalFee: 999999,
    });
    expect(res.status).toBe(200);
    expect(res.body.plan.prepaymentAmount).toBe(200000); // 120000 + 80000
    expect(paymentStore.get('pay-test')?.amount).toBe(200000);
  });

  it('타인 요청은 결제 불가(403)', async () => {
    const owner = makeUser('01060000003');
    const other = makeUser('01060000004');
    const request = makeRequest(owner.id);
    acceptQuote(request.id, owner.id, 'TRANSPORT', 100000);
    const res = await post('/api/payments/prepay', sessionStore.issue(other.id), {
      matchRequestId: request.id,
      completedDate: '2026-07-10',
    });
    expect(res.status).toBe(403);
  });
});

describe('취소 — 결제자 본인 + 기록 기준 금액', () => {
  async function prepaid(owner: { id: string }, request: { id: string }) {
    acceptQuote(request.id, owner.id, 'TRANSPORT', 100000);
    await post('/api/payments/prepay', sessionStore.issue(owner.id), {
      matchRequestId: request.id,
      completedDate: '2026-07-10',
    });
  }

  it('본인 결제는 취소 가능', async () => {
    const owner = makeUser('01060000005');
    const request = makeRequest(owner.id);
    await prepaid(owner, request);
    const res = await post('/api/payments/cancel', sessionStore.issue(owner.id), {
      paymentId: 'pay-test',
      stage: 'BEFORE_DISPATCH',
    });
    expect(res.status).toBe(200);
    expect(paymentStore.get('pay-test')?.status).toBe('CANCELLED');
  });

  it('타인은 취소 불가(403)', async () => {
    const owner = makeUser('01060000006');
    const other = makeUser('01060000007');
    const request = makeRequest(owner.id);
    await prepaid(owner, request);
    const res = await post('/api/payments/cancel', sessionStore.issue(other.id), {
      paymentId: 'pay-test',
      stage: 'BEFORE_DISPATCH',
    });
    expect(res.status).toBe(403);
  });

  it('없는 결제는 404', async () => {
    const owner = makeUser('01060000008');
    const res = await post('/api/payments/cancel', sessionStore.issue(owner.id), {
      paymentId: 'no-such',
      stage: 'BEFORE_DISPATCH',
    });
    expect(res.status).toBe(404);
  });
});
