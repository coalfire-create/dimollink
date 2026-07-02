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
