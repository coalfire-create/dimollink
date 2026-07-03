import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { createRequireAuth } from '../middleware/auth.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createPaymentsRouter } from './payments.js';

let server: Server;
let base: string;
let requestStore: RequestStore;
let userStore: UserStore;
let sessionStore: SessionTokenStore;

beforeEach(async () => {
  requestStore = new RequestStore();
  userStore = new UserStore();
  sessionStore = new SessionTokenStore();
  const app = express();
  app.use(express.json());
  const requireAuth = createRequireAuth(sessionStore, userStore);
  app.post('/api/payments/prepay', requireAuth);
  app.use('/api', createPaymentsRouter(undefined, requestStore));
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

const prepay = (matchRequestId: string, token: string) =>
  fetch(`${base}/api/payments/prepay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      matchRequestId,
      transportFee: 100000,
      disposalFee: 50000,
      completedDate: '2026-07-10',
    }),
  }).then((r) => r.status);

describe('POST /api/payments/prepay — 요청자 본인 검증', () => {
  it('타인의 요청은 결제 불가(403)', async () => {
    const owner = makeUser('01050000001');
    const other = makeUser('01050000002');
    const request = requestStore.create({
      kind: 'DEMOLITION',
      requesterId: owner.id,
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      siteAddress: '양평읍 현장',
    });
    expect(await prepay(request.id, sessionStore.issue(other.id))).toBe(403);
  });

  it('존재하지 않는 요청은 404', async () => {
    const owner = makeUser('01050000003');
    expect(await prepay('no-such-request', sessionStore.issue(owner.id))).toBe(404);
  });

  it('본인 요청이면 소유권 검증을 통과한다(403/404 아님)', async () => {
    const owner = makeUser('01050000004');
    const request = requestStore.create({
      kind: 'DEMOLITION',
      requesterId: owner.id,
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 3,
      allbaroRequested: false,
      siteAddress: '양평읍 현장',
    });
    const status = await prepay(request.id, sessionStore.issue(owner.id));
    // 소유권 통과 후 PortOne 미설정으로 503 등이 날 수 있으나 403/404 는 아니어야 한다.
    expect(status).not.toBe(403);
    expect(status).not.toBe(404);
  });
});
