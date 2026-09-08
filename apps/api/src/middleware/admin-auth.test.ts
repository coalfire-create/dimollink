import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { createAdminAuth } from './admin-auth.js';

function run(expectedToken: string | undefined, providedToken?: string) {
  const middleware = createAdminAuth(expectedToken);
  let statusCode: number | undefined;
  let nextCalled = false;
  const req = {
    header: (name: string) => (name === 'x-admin-token' ? providedToken : undefined),
  } as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;
  middleware(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);
  return { statusCode, nextCalled };
}

describe('createAdminAuth — 백오피스 가드', () => {
  it('토큰 미설정이면 503 (백오피스 비활성)', () => {
    expect(run(undefined, 'anything')).toEqual({ statusCode: 503, nextCalled: false });
  });

  it('토큰 일치 시 통과', () => {
    expect(run('secret-token', 'secret-token')).toEqual({
      statusCode: undefined,
      nextCalled: true,
    });
  });

  it('불일치·미제공·길이 다른 토큰은 401', () => {
    expect(run('secret-token', 'wrong').statusCode).toBe(401);
    expect(run('secret-token', undefined).statusCode).toBe(401);
    expect(run('secret-token', 'secret-token-extra').statusCode).toBe(401);
  });
});

/** 계정 경로는 세션 조회가 비동기라 next 호출을 기다려야 한다. */
function runAsync(options: Parameters<typeof createAdminAuth>[0], headerToken?: string) {
  const middleware = createAdminAuth(options);
  return new Promise<{ statusCode?: number; nextCalled: boolean; actorId?: string }>((resolve) => {
    let statusCode: number | undefined;
    const req = {
      header: (name: string) => (name === 'x-admin-token' ? headerToken : undefined),
    } as Request;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        resolve({ statusCode, nextCalled: false });
        return this;
      },
    } as unknown as Response;
    middleware(req, res, (() => {
      resolve({
        statusCode,
        nextCalled: true,
        actorId: (req as { adminUser?: { id: string } }).adminUser?.id,
      });
    }) as NextFunction);
  });
}

const ADMIN_USER = { id: 'admin-1', role: 'ADMIN', approvalStatus: 'APPROVED' } as never;

describe('createAdminAuth — 관리자 계정 경로', () => {
  it('role=ADMIN 회원은 토큰 없이 통과하고, 누가 했는지 남는다', async () => {
    const result = await runAsync({ lookupUser: async () => ADMIN_USER });
    expect(result.nextCalled).toBe(true);
    // 공유 토큰과 달리 행위자가 남아야 감사 로그를 쓸 수 있다.
    expect(result.actorId).toBe('admin-1');
  });

  it('일반 회원은 401', async () => {
    const member = { id: 'u1', role: 'MEMBER', approvalStatus: 'APPROVED' } as never;
    expect((await runAsync({ lookupUser: async () => member })).statusCode).toBe(401);
  });

  it('정지된 관리자는 막는다 — 정지가 의미를 가지려면', async () => {
    const suspended = { id: 'a2', role: 'ADMIN', approvalStatus: 'SUSPENDED' } as never;
    expect((await runAsync({ lookupUser: async () => suspended })).statusCode).toBe(401);
  });

  it('비로그인이어도 공유 운영 토큰이 맞으면 통과한다 — 비상 경로', async () => {
    const result = await runAsync(
      { token: 'ops-token', lookupUser: async () => undefined },
      'ops-token',
    );
    expect(result.nextCalled).toBe(true);
    // 공유 토큰은 누가 썼는지 남지 않는다. 그 사실 자체를 확인해 둔다.
    expect(result.actorId).toBeUndefined();
  });

  it('둘 다 아니면 401', async () => {
    expect(
      (await runAsync({ token: 'ops-token', lookupUser: async () => undefined }, 'wrong')).statusCode,
    ).toBe(401);
  });

  it('계정 경로만 있고 통과 못 하면 401 — 503(비활성)이 아니다', async () => {
    // 503 은 "백오피스가 꺼져 있다"는 뜻이라, 계정 경로가 살아 있으면 쓰면 안 된다.
    expect((await runAsync({ lookupUser: async () => undefined })).statusCode).toBe(401);
  });
});
