import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { createRequireAuth } from '../middleware/auth.js';
import { InteriorStore } from '../interior/store.js';
import { PaymentStore } from '../payment/payment-store.js';
import { compositePayableStore } from '../payment/payable-request.js';
import type { PaymentService } from '../payment/payment-service.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createPaymentsRouter } from './payments.js';

/**
 * 인테리어 낙찰 → 선결제 통합. compositePayableStore 로 인테리어 요청 id 도
 * 결제 라우터가 소유 스토어를 판별해 금액 권위(agreedFee)·상태 전이를 처리하는지 검증한다.
 */

let server: Server;
let base: string;
let interiorStore: InteriorStore;
let userStore: UserStore;
let paymentStore: PaymentStore;
let sessionStore: SessionTokenStore;

const fakeService = {
  confirmPrepayment: async (_paymentId: string, plan: { prepaymentAmount: number }) => ({
    paymentId: 'pay-interior-test',
    amount: plan.prepaymentAmount,
    status: 'PAID',
    paid: true,
  }),
} as unknown as PaymentService;

beforeEach(async () => {
  interiorStore = new InteriorStore();
  userStore = new UserStore();
  paymentStore = new PaymentStore();
  sessionStore = new SessionTokenStore();
  const app = express();
  app.use(express.json());
  app.post('/api/payments/prepay', createRequireAuth(sessionStore, userStore));
  app.use(
    '/api',
    createPaymentsRouter(
      fakeService,
      compositePayableStore(new RequestStore(), interiorStore),
      undefined,
      paymentStore,
      userStore,
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

const token = (id: string) => sessionStore.issue(id);
const user = (phone: string, name = '사용자') =>
  userStore.create({ userType: 'CONSUMER', name, region: PILOT.region, phone });

/** 매칭(MATCHED)까지 진행한 인테리어 요청을 만든다. */
async function matchedRequest(consumerId: string, providerId: string, amount: number) {
  const req = await interiorStore.createRequest({
    requesterId: consumerId,
    region: PILOT.region,
    category: 'RESIDENTIAL',
    title: '리모델링',
    description: '',
    siteAddress: '양평읍 현장',
  });
  const bid = await interiorStore.submitBid({ requestId: req.id, providerId, amount });
  await interiorStore.acceptBid(bid.id, consumerId);
  return req;
}

const prepay = async (requestId: string, payerId: string) =>
  fetch(`${base}/api/payments/prepay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await token(payerId)}` },
    body: JSON.stringify({ matchRequestId: requestId, paymentId: 'pay-interior-test', completedDate: '2026-07-15' }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('인테리어 선결제 (composite payable store)', () => {
  it('낙찰가(agreedFee)로 선결제되고 요청이 PAID 로 전이된다', async () => {
    const consumer = await user('01070000001');
    const provider = await user('01070000002', '가온인테리어');
    const req = await matchedRequest(consumer.id, provider.id, 18_000_000);

    const res = await prepay(req.id, consumer.id);
    expect(res.status).toBe(200);
    // 금액 권위: 클라이언트가 아닌 서버 확정 낙찰가.
    expect(res.body.plan.prepaymentAmount).toBe(18_000_000);

    expect((await interiorStore.getRequest(req.id))?.status).toBe('PAID');
    expect((await interiorStore.getRequest(req.id))?.paymentId).toBe('pay-interior-test');
  });

  it('요청자 본인이 아니면 선결제 불가(403)', async () => {
    const consumer = await user('01070000010');
    const provider = await user('01070000011', '한샘시공');
    const other = await user('01070000012');
    const req = await matchedRequest(consumer.id, provider.id, 12_000_000);

    const res = await prepay(req.id, other.id);
    expect(res.status).toBe(403);
    expect((await interiorStore.getRequest(req.id))?.status).toBe('MATCHED');
  });
});
