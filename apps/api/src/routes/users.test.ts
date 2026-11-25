import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { UserProfile } from '@dimol/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CredentialStore } from '../auth/credential-store.js';
import { OtpService } from '../auth/otp-service.js';
import { SessionTokenStore } from '../auth/session-store.js';
import { createRequireAuth } from '../middleware/auth.js';
import { UserStore } from '../users/store.js';
import { createUsersRouter } from './users.js';

/**
 * 회원 목록 응답의 PII 노출 범위.
 *
 * 이 목록은 소비자 홈에서 "승인된 철거업체 고르기"에 쓰인다. 로그인만 하면 전 회원의
 * 휴대폰번호·사업자등록번호를 통째로 받아갈 수 있으면 안 된다(CLAUDE.md: PII 취급).
 */

let server: Server;
let base: string;
let userStore: UserStore;
let sessionStore: SessionTokenStore;
let otpService: OtpService;

beforeEach(async () => {
  userStore = new UserStore();
  sessionStore = new SessionTokenStore();
  otpService = new OtpService({ generateCode: () => '123456' });
  const app = express();
  app.use(express.json());
  const requireAuth = createRequireAuth(sessionStore, userStore);
  app.use('/api/users/:id', requireAuth);
  app.get('/api/users', requireAuth);
  app.use(
    '/api',
    createUsersRouter(
      userStore,
      otpService,
      sessionStore,
      new CredentialStore(),
      // 소비자 가입만 쓰므로 올바로 검증 경로는 타지 않는다.
      undefined as never,
    ),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  server.close();
});

async function makeConsumer(name: string, phone: string): Promise<UserProfile> {
  return userStore.create({ userType: 'CONSUMER', name, region: '경기 양평', phone });
}

describe('GET /api/users — 목록의 PII', () => {
  it('남의 연락처·사업자번호는 목록에 나오지 않는다', async () => {
    const me = await makeConsumer('나', '01011110001');
    await makeConsumer('남', '01011110002');
    const token = await sessionStore.issue(me.id);

    const res = await fetch(`${base}/api/users`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const list = (await res.json()) as UserProfile[];

    expect(res.status).toBe(200);
    expect(list).toHaveLength(2);
    const other = list.find((u) => u.id !== me.id);
    expect(other?.name).toBe('남'); // 업체 고르기에 필요한 정보는 그대로 남는다.
    expect(other?.phone).toBeUndefined();
    expect(other?.businessNumber).toBeUndefined();
  });

  it('본인 정보는 목록에서도 그대로 본다', async () => {
    const me = await makeConsumer('나', '01011110001');
    const token = await sessionStore.issue(me.id);

    const res = await fetch(`${base}/api/users`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const list = (await res.json()) as UserProfile[];

    expect(list.find((u) => u.id === me.id)?.phone).toBe('01011110001');
  });

  it('타인 프로필 조회(목록·단건)에서 email 과 socialIdentities 를 제외한다', async () => {
    const me = await makeConsumer('나', '01011110003');
    const other = await makeConsumer('남', '01011110004');
    await userStore.update(other.id, { email: 'private@dimol.test' });
    await userStore.linkSocialIdentity(other.id, {
      provider: 'kakao',
      providerUserId: 'kakao-999',
      email: 'private@dimol.test',
      linkedAt: new Date().toISOString(),
    });
    const myToken = await sessionStore.issue(me.id);
    const otherToken = await sessionStore.issue(other.id);

    const listRes = await fetch(`${base}/api/users`, {
      headers: { authorization: `Bearer ${myToken}` },
    });
    const list = (await listRes.json()) as Array<Record<string, unknown>>;
    const publicFromList = list.find((u) => u.id === other.id);
    expect(publicFromList?.email).toBeUndefined();
    expect(publicFromList?.socialIdentities).toBeUndefined();

    const detailRes = await fetch(`${base}/api/users/${other.id}`, {
      headers: { authorization: `Bearer ${myToken}` },
    });
    const publicDetail = (await detailRes.json()) as Record<string, unknown>;
    expect(publicDetail.email).toBeUndefined();
    expect(publicDetail.socialIdentities).toBeUndefined();

    const selfRes = await fetch(`${base}/api/users/${other.id}`, {
      headers: { authorization: `Bearer ${otherToken}` },
    });
    const selfDetail = (await selfRes.json()) as Record<string, unknown>;
    expect(selfDetail.email).toBe('private@dimol.test');
  });
});

describe('PATCH /api/users/:id 검증 강화', () => {
  it('매칭 반경 radiusKm 은 1~100km 범위 밖(0, 101)을 400 으로 거부한다', async () => {
    const carrier = await userStore.create({
      userType: 'TRANSPORT_COMPANY',
      name: '한길운반',
      region: '전국',
      phone: '01022223333',
      businessNumber: '220-81-62517',
      autoApprove: true,
    });
    const token = await sessionStore.issue(carrier.id);

    for (const badRadius of [0, 101]) {
      const res = await fetch(`${base}/api/users/${carrier.id}/availability`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ availability: 'ONLINE', radiusKm: badRadius }),
      });
      expect(res.status).toBe(400);
    }

    const ok = await fetch(`${base}/api/users/${carrier.id}/availability`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ availability: 'ONLINE', radiusKm: 30 }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as UserProfile).matchRadiusKm).toBe(30);
  });

  it('휴대폰번호 변경은 새 번호 OTP 검증 전에는 403 으로 거부하고, 검증 후에는 반영한다', async () => {
    const me = await makeConsumer('변경테스트', '01033334444');
    const token = await sessionStore.issue(me.id);

    const blocked = await fetch(`${base}/api/users/${me.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone: '01088887777' }),
    });
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { code?: string }).code).toBe('PHONE_NOT_VERIFIED');

    await otpService.request('01088887777');
    await otpService.verify('01088887777', '123456');

    const ok = await fetch(`${base}/api/users/${me.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone: '01088887777' }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as UserProfile).phone).toBe('01088887777');
  });
});
