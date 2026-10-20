import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PILOT } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { createAdminAuth } from '../middleware/admin-auth.js';
import { createRequireAuth } from '../middleware/auth.js';
import { OfferStore } from '../offers/store.js';
import { RequestStore } from '../requests/store.js';
import { UserStore } from '../users/store.js';
import { createOffersRouter } from './offers.js';

const ADMIN_TOKEN = 'test-admin-token';
const BIZ_A = '1208147521';
const BIZ_B = '1234567891';

let server: Server;
let base: string;
let requestStore: RequestStore;
let userStore: UserStore;
let offerStore: OfferStore;
let sessionStore: SessionTokenStore;

beforeEach(async () => {
  requestStore = new RequestStore();
  userStore = new UserStore();
  offerStore = new OfferStore(requestStore);
  sessionStore = new SessionTokenStore();

  const requireAuth = createRequireAuth(sessionStore, userStore);
  const requireAdmin = createAdminAuth({ token: ADMIN_TOKEN });

  const app = express();
  app.use(express.json());
  app.post('/api/offers', requireAdmin);
  app.post('/api/offers/sweep', requireAdmin);
  app.get('/api/offers', requireAuth);
  app.post('/api/offers/:id/accept', requireAuth);
  app.post('/api/offers/:id/decline', requireAuth);
  app.use('/api', createOffersRouter(offerStore));

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

describe('자동매칭 오퍼 라우트 권한 및 당사자 검증 (/api/offers)', () => {
  it('일반 회원은 오퍼 생성·스윕 호출 불가(401), 관리자는 가능(201/200)', async () => {
    const provider = await userStore.create({
      userType: 'TRANSPORT_COMPANY',
      name: '운반사A',
      region: PILOT.region,
      phone: '01031000001',
      businessNumber: BIZ_A,
    });
    const req = await requestStore.create({
      kind: 'TRANSPORT',
      requesterId: 'c-1',
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 5,
      allbaroRequested: false,
      loadAddress: '양평 상차지',
      unloadAddress: '양평 하차지',
    });
    const userToken = await sessionStore.issue(provider.id);

    const forbiddenCreate = await fetch(`${base}/api/offers`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ requestId: req.id, providerId: provider.id }),
    });
    expect(forbiddenCreate.status).toBe(401);

    const adminCreate = await fetch(`${base}/api/offers`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': ADMIN_TOKEN,
      },
      body: JSON.stringify({ requestId: req.id, providerId: provider.id }),
    });
    expect(adminCreate.status).toBe(201);
  });

  it('제안받은 업체 본인만 수락·거절할 수 있고 다른 업체는 403 으로 차단된다', async () => {
    const p1 = await userStore.create({
      userType: 'TRANSPORT_COMPANY',
      name: '운반사1',
      region: PILOT.region,
      phone: '01031000002',
      businessNumber: BIZ_A,
    });
    const p2 = await userStore.create({
      userType: 'TRANSPORT_COMPANY',
      name: '운반사2',
      region: PILOT.region,
      phone: '01031000003',
      businessNumber: BIZ_B,
    });
    const req = await requestStore.create({
      kind: 'TRANSPORT',
      requesterId: 'c-1',
      region: PILOT.region,
      wasteCategory: PILOT.wasteCategory,
      wasteTons: 5,
      allbaroRequested: false,
      loadAddress: '양평 상차지',
      unloadAddress: '양평 하차지',
    });

    const offer = await offerStore.createOffer({ requestId: req.id, providerId: p1.id });
    const otherToken = await sessionStore.issue(p2.id);
    const ownerToken = await sessionStore.issue(p1.id);

    const hijackAccept = await fetch(`${base}/api/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(hijackAccept.status).toBe(403);

    const hijackDecline = await fetch(`${base}/api/offers/${offer.id}/decline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(hijackDecline.status).toBe(403);

    const ownerAccept = await fetch(`${base}/api/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerAccept.status).toBe(200);
    expect((await ownerAccept.json()).status).toBe('ACCEPTED');
  });
});
