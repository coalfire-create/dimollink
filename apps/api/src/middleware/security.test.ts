import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter, securityHeaders } from './security.js';

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
