import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { SessionTokenStore } from '../auth/session-store.js';
import { UserStore } from '../users/store.js';
import { createRequireAuth } from './auth.js';
import { createRateLimiter, requestId, securityHeaders } from './security.js';

function mockRes() {
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    headers,
    setHeader: (k: string, v: string) => headers.set(k.toLowerCase(), v),
    removeHeader: (k: string) => headers.delete(k.toLowerCase()),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn(),
  };
  return res as unknown as Response & { statusCode: number; headers: Map<string, string>; json: ReturnType<typeof vi.fn> };
}

describe('securityHeaders', () => {
  it('표준 보안 헤더를 설정한다', () => {
    const res = mockRes();
    securityHeaders(false)({} as Request, res, (() => {}) as NextFunction);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.has('strict-transport-security')).toBe(false);
  });

  it('운영에서는 HSTS 를 추가한다', () => {
    const res = mockRes();
    securityHeaders(true)({} as Request, res, (() => {}) as NextFunction);
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
  });
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createRateLimiter', () => {
  it('max 이하 요청은 통과, 초과 시 429', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const req = { ip: '1.2.3.4', socket: {} } as unknown as Request;

    let passed = 0;
    for (let i = 0; i < 3; i += 1) {
      const res = mockRes();
      limiter(req, res, (() => (passed += 1)) as NextFunction);
      await flush();
    }
    expect(passed).toBe(3);

    const res = mockRes();
    limiter(req, res, (() => (passed += 1)) as NextFunction);
    await flush();
    expect(res.statusCode).toBe(429);
    expect(res.headers.has('retry-after')).toBe(true);
    expect(passed).toBe(3); // 초과분은 next() 호출 안 됨
  });

  it('IP 별로 카운트를 분리한다', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const resA = mockRes();
    limiter({ ip: 'a', socket: {} } as unknown as Request, resA, (() => {}) as NextFunction);
    await flush();
    const resB = mockRes();
    let bPassed = false;
    limiter({ ip: 'b', socket: {} } as unknown as Request, resB, (() => (bPassed = true)) as NextFunction);
    await flush();
    expect(bPassed).toBe(true);
    expect(resB.statusCode).toBe(200);
  });
});

describe('requestId', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it('유효한 X-Request-Id 는 그대로 유지하고, 규칙 위반 헤더는 새 UUID 로 교체한다', () => {
    const mw = requestId();

    const okRes = mockRes();
    mw({ header: () => 'req-abc.123_ok' } as unknown as Request, okRes, vi.fn() as unknown as NextFunction);
    expect(okRes.headers.get('x-request-id')).toBe('req-abc.123_ok');

    for (const invalid of ['bad id with space', 'line1\nline2', 'a'.repeat(65)]) {
      const badRes = mockRes();
      mw({ header: () => invalid } as unknown as Request, badRes, vi.fn() as unknown as NextFunction);
      expect(badRes.headers.get('x-request-id')).toMatch(UUID_RE);
    }
  });
});

describe('createRequireAuth — 계정 정지 차단', () => {
  it('SUSPENDED 회원은 403 ACCOUNT_SUSPENDED 로 차단한다', async () => {
    const userStore = new UserStore();
    const sessionStore = new SessionTokenStore();
    const user = await userStore.create({
      userType: 'CONSUMER',
      name: '정지회원',
      region: '전국',
      phone: '01099998888',
    });
    await userStore.setApprovalStatus(user.id, 'SUSPENDED');
    const token = await sessionStore.issue(user.id);

    const res = mockRes();
    const next = vi.fn();
    createRequireAuth(sessionStore, userStore)(
      { header: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined) } as unknown as Request,
      res,
      next as unknown as NextFunction,
    );
    await flush();

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_SUSPENDED' }));
    expect(next).not.toHaveBeenCalled();
  });
});
