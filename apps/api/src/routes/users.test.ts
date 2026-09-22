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

beforeEach(async () => {
  userStore = new UserStore();
  sessionStore = new SessionTokenStore();
  const app = express();
  app.use(express.json());
  app.get('/api/users', createRequireAuth(sessionStore, userStore));
  app.use(
    '/api',
    createUsersRouter(
      userStore,
      new OtpService(),
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
});
