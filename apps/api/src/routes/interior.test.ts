import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { createRequireAuth } from '../middleware/auth.js';
import { InteriorStore } from '../interior/store.js';
import { UserStore } from '../users/store.js';
import { createInteriorRouter } from './interior.js';

let server: Server;
let base: string;
let userStore: UserStore;
let sessionStore: SessionTokenStore;

const tokenOf = (userId: string) => sessionStore.issue(userId);

/** 파일럿에 INTERIOR_COMPANY 유형이 아직 없어, 인증만 통과하면 되는 스탠드인 계정으로 만든다. */
function makeUser(phone: string) {
  return userStore.create({ userType: 'CONSUMER', name: '사용자', region: PILOT.region, phone });
}

beforeEach(async () => {
  userStore = new UserStore();
  sessionStore = new SessionTokenStore();
  const app = express();
  app.use(express.json());
  app.use('/api/interior', createRequireAuth(sessionStore, userStore));
  app.use('/api', createInteriorRouter(new InteriorStore()));
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

const api = (path: string, userId: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${tokenOf(userId)}`,
      ...(init.headers ?? {}),
    },
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

async function createRequest(consumerId: string) {
  const res = await api('/api/interior/requests', consumerId, {
    method: 'POST',
    body: JSON.stringify({
      region: PILOT.region,
      category: 'RESIDENTIAL',
      title: '30평 리모델링',
      description: '전체 시공',
      siteAddress: '양평읍 현장',
    }),
  });
  return res;
}

const bid = (requestId: string, providerId: string, amount: number) =>
  api(`/api/interior/requests/${requestId}/bids`, providerId, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });

const listBids = (requestId: string, viewerId: string) =>
  api(`/api/interior/requests/${requestId}/bids`, viewerId);

describe('인테리어 밀봉 역경매 API (/api/interior)', () => {
  it('밀봉: 업체는 자기 입찰만, 소비자는 전체, 제3자는 빈 목록', async () => {
    const consumer = makeUser('01030000001');
    const bizA = makeUser('01030000002');
    const bizB = makeUser('01030000003');
    const outsider = makeUser('01030000004');

    const req = await createRequest(consumer.id);
    expect(req.status).toBe(201);
    await bid(req.body.id, bizA.id, 20_000_000);
    await bid(req.body.id, bizB.id, 18_000_000);

    const asA = await listBids(req.body.id, bizA.id);
    expect(asA.body).toHaveLength(1);
    expect(asA.body[0].providerId).toBe(bizA.id);

    const asConsumer = await listBids(req.body.id, consumer.id);
    expect(asConsumer.body).toHaveLength(2);

    const asOutsider = await listBids(req.body.id, outsider.id);
    expect(asOutsider.body).toHaveLength(0);
  });

  it('로그인 없으면 401', async () => {
    const res = await fetch(`${base}/api/interior/requests`);
    expect(res.status).toBe(401);
  });

  it('낙찰: 소비자만 낙찰 가능, 낙찰 시 MATCHED + agreedFee', async () => {
    const consumer = makeUser('01030000010');
    const bizA = makeUser('01030000011');
    const req = await createRequest(consumer.id);
    const b = await bid(req.body.id, bizA.id, 17_500_000);

    // 업체가 남의 요청을 낙찰 시도 → 400
    const byBiz = await api(`/api/interior/bids/${b.body.id}/accept`, bizA.id, { method: 'POST' });
    expect(byBiz.status).toBe(400);

    const byConsumer = await api(`/api/interior/bids/${b.body.id}/accept`, consumer.id, {
      method: 'POST',
    });
    expect(byConsumer.status).toBe(200);
    expect(byConsumer.body.status).toBe('ACCEPTED');

    const detail = await api(`/api/interior/requests/${req.body.id}`, consumer.id);
    expect(detail.body.status).toBe('MATCHED');
    expect(detail.body.matchedProviderId).toBe(bizA.id);
    expect(detail.body.agreedFee).toBe(17_500_000);
  });
});
