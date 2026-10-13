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
  // 앱 체크아웃으로 만든 결제(paymentId)를 검증하는 모델. 여기선 항상 완료(PAID)로 가정.
  confirmPrepayment: async (_paymentId: string, plan: { prepaymentAmount: number }) => ({
    paymentId: 'pay-test',
    amount: plan.prepaymentAmount,
    status: 'PAID',
    paid: true,
  }),
  verifyWebhook: async () => ({ type: 'noop' }),
  cancel: async () => ({
    breakdown: { stage: 'BEFORE_DISPATCH', cancellable: true, paidAmount: 0, penaltyAmount: 0, refundAmount: 0 },
  }),
  executePayouts: async () => [],
  issueTaxInvoices: async () => [],
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
async function acceptQuote(
  requestId: string,
  requesterId: string,
  party: 'TRANSPORT' | 'DISPOSAL',
  amount: number,
) {
  const q = await quoteStore.createQuote({ requestId, providerId: `${party}-p`, party, amount });
  await quoteStore.accept(q.id, requesterId);
}
const post = (path: string, token: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('선결제 — 금액 권위(수락 견적 기준)', () => {
  it('수락된 견적이 없으면 409(NO_ACCEPTED_QUOTE)', async () => {
    const owner = await makeUser('01060000001');
    const request = await makeRequest(owner.id);
    const res = await post('/api/payments/prepay', await sessionStore.issue(owner.id), {
      matchRequestId: request.id,
      paymentId: 'pay-test',
      completedDate: '2026-07-10',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_AGREED_AMOUNT');
  });

  it('선결제 금액은 클라이언트 입력이 아닌 수락 견적에서 산출된다', async () => {
    const owner = await makeUser('01060000002');
    const request = await makeRequest(owner.id);
    // 요청 1건 = 단일 party(수락 시 매칭 확정). 여기선 운반 견적 하나를 수락.
    await acceptQuote(request.id, owner.id, 'TRANSPORT', 120000);

    const res = await post('/api/payments/prepay', await sessionStore.issue(owner.id), {
      matchRequestId: request.id,
      paymentId: 'pay-test',
      completedDate: '2026-07-10',
      transportFee: 999999, // 조작 시도 — 무시되어야 함
      disposalFee: 999999,
    });
    expect(res.status).toBe(200);
    expect(res.body.plan.prepaymentAmount).toBe(120000); // 수락 견적 금액
    expect((await paymentStore.get('pay-test'))?.amount).toBe(120000);
  });

  it('선착순 합의 금액(agreedFee)으로도 결제 금액이 산출된다', async () => {
    const owner = await makeUser('01060000009');
    const request = await makeRequest(owner.id);
    // 선착순 수락 시뮬레이션: 매칭 + 합의 금액 기록.
    await requestStore.changeStatus(request.id, 'MATCHED', {
      matchedProviderId: 'demo-company',
      agreedFee: 150000,
    });
    const res = await post('/api/payments/prepay', await sessionStore.issue(owner.id), {
      matchRequestId: request.id,
      paymentId: 'pay-test',
      completedDate: '2026-07-10',
    });
    expect(res.status).toBe(200);
    expect(res.body.plan.prepaymentAmount).toBe(150000);
  });

  it('타인 요청은 결제 불가(403)', async () => {
    const owner = await makeUser('01060000003');
    const other = await makeUser('01060000004');
    const request = await makeRequest(owner.id);
    await acceptQuote(request.id, owner.id, 'TRANSPORT', 100000);
    const res = await post('/api/payments/prepay', await sessionStore.issue(other.id), {
      matchRequestId: request.id,
      paymentId: 'pay-test',
      completedDate: '2026-07-10',
    });
    expect(res.status).toBe(403);
  });
});

describe('선결제 — 결제 재사용 방지', () => {
  async function paidRequest(phone: string, amount: number) {
    const owner = await makeUser(phone);
    const request = await makeRequest(owner.id);
    await acceptQuote(request.id, owner.id, 'TRANSPORT', amount);
    return { owner, request };
  }
  const prepay = async (ownerId: string, matchRequestId: string) =>
    post('/api/payments/prepay', await sessionStore.issue(ownerId), {
      matchRequestId,
      paymentId: 'pay-test',
      completedDate: '2026-07-10',
    });

  it('같은 금액의 다른 요청에 이미 쓴 결제를 내밀면 409(PAYMENT_ALREADY_USED), 기존 기록 유지', async () => {
    const a = await paidRequest('01060000011', 300000);
    expect((await prepay(a.owner.id, a.request.id)).status).toBe(200);

    const b = await makeRequest(a.owner.id);
    await acceptQuote(b.id, a.owner.id, 'TRANSPORT', 300000);
    const res = await prepay(a.owner.id, b.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_ALREADY_USED');
    expect((await paymentStore.get('pay-test'))?.matchRequestId).toBe(a.request.id);
  });

  it('같은 요청의 재확인은 허용', async () => {
    const a = await paidRequest('01060000012', 200000);
    expect((await prepay(a.owner.id, a.request.id)).status).toBe(200);
    expect((await prepay(a.owner.id, a.request.id)).status).toBe(200);
  });

  it('취소된 결제는 같은 요청이라도 다시 확정할 수 없다', async () => {
    const a = await paidRequest('01060000013', 200000);
    expect((await prepay(a.owner.id, a.request.id)).status).toBe(200);
    await paymentStore.markCancelled('pay-test');
    const res = await prepay(a.owner.id, a.request.id);
    expect(res.status).toBe(409);
    expect((await paymentStore.get('pay-test'))?.status).toBe('CANCELLED');
  });
});

describe('취소 — 결제자 본인 + 기록 기준 금액', () => {
  async function prepaid(owner: { id: string }, request: { id: string }) {
    await acceptQuote(request.id, owner.id, 'TRANSPORT', 100000);
    await post('/api/payments/prepay', await sessionStore.issue(owner.id), {
      matchRequestId: request.id,
      paymentId: 'pay-test',
      completedDate: '2026-07-10',
    });
  }

  it('본인 결제는 취소 가능 + 요청도 취소 처리된다', async () => {
    const owner = await makeUser('01060000005');
    const request = await makeRequest(owner.id);
    await prepaid(owner, request);
    const res = await post('/api/payments/cancel', await sessionStore.issue(owner.id), {
      paymentId: 'pay-test',
      stage: 'BEFORE_DISPATCH',
    });
    expect(res.status).toBe(200);
    expect((await paymentStore.get('pay-test'))?.status).toBe('CANCELLED');
    expect((await requestStore.get(request.id))?.status).toBe('CANCELLED');
  });

  it('타인은 취소 불가(403)', async () => {
    const owner = await makeUser('01060000006');
    const other = await makeUser('01060000007');
    const request = await makeRequest(owner.id);
    await prepaid(owner, request);
    const res = await post('/api/payments/cancel', await sessionStore.issue(other.id), {
      paymentId: 'pay-test',
      stage: 'BEFORE_DISPATCH',
    });
    expect(res.status).toBe(403);
  });

  it('없는 결제는 404', async () => {
    const owner = await makeUser('01060000008');
    const res = await post('/api/payments/cancel', await sessionStore.issue(owner.id), {
      paymentId: 'no-such',
      stage: 'BEFORE_DISPATCH',
    });
    expect(res.status).toBe(404);
  });
});

describe('정산 지급(payouts) — 금액 권위 + SETTLED 전이', () => {
  it('작업완료 요청을 정산 실행하면 SETTLED 로 전이한다', async () => {
    const owner = await makeUser('01060000011');
    const request = await makeRequest(owner.id);
    // 라이프사이클: 매칭(금액)→결제→작업시작→작업완료.
    await requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p', agreedFee: 100000 });
    await requestStore.changeStatus(request.id, 'PAID', { paymentId: 'x' });
    await requestStore.changeStatus(request.id, 'IN_PROGRESS');
    await requestStore.changeStatus(request.id, 'COMPLETED');

    const res = await fetch(`${base}/api/payments/payouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchRequestId: request.id, completedDate: '2026-07-10' }),
    });
    expect(res.status).toBe(200);
    expect((await requestStore.get(request.id))?.status).toBe('SETTLED');
  });
});

/**
 * 결제창 설정 — 앱이 상점·채널을 서버에서 받아간다.
 * 앱 번들에 박힌 값과 서버가 검증에 쓰는 상점이 어긋나는 사고를 막는 창구라,
 * 값이 없을 때 빈 값을 내려보내지 않는지까지 본다.
 */
describe('GET /api/payments/config', () => {
  const saved = { storeId: process.env.PORTONE_STORE_ID, channelKey: process.env.PORTONE_CHANNEL_KEY };
  afterEach(() => {
    process.env.PORTONE_STORE_ID = saved.storeId;
    process.env.PORTONE_CHANNEL_KEY = saved.channelKey;
  });

  it('상점·채널·모드를 내려준다', async () => {
    const res = await fetch(`${base}/api/payments/config`);
    const body = (await res.json()) as Record<string, unknown>;
    if (res.status === 200) {
      expect(typeof body.storeId).toBe('string');
      expect(typeof body.channelKey).toBe('string');
      expect(['test', 'live']).toContain(body.mode);
    } else {
      // 설정이 비어 있는 환경(로컬 CI)에서는 빈 값 대신 503 으로 알린다.
      expect(res.status).toBe(503);
      expect(body.code).toBe('CONFIG_MISSING');
    }
  });

  it('시크릿(API Secret·웹훅 시크릿)은 절대 내려보내지 않는다', async () => {
    const res = await fetch(`${base}/api/payments/config`);
    const text = await res.text();
    expect(text).not.toContain('apiSecret');
    expect(text).not.toContain('webhookSecret');
    expect(text.toLowerCase()).not.toContain('secret');
  });
});
