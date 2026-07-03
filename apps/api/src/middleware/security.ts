import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** 요청 상관관계 ID — 로그·응답 헤더(X-Request-Id)에 실어 추적한다. */
export function requestId() {
  return function assignRequestId(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const id = (incoming && incoming.length <= 64 ? incoming : randomUUID());
    (req as Request & { id?: string }).id = id;
    res.setHeader('X-Request-Id', id);
    next();
  };
}

/**
 * 상용 보안 미들웨어 (외부 의존성 없이 최소 구성).
 * - securityHeaders: 표준 보안 헤더.
 * - createRateLimiter: IP 기준 고정 윈도 레이트리밋(무차별 대입·남용 방지).
 *
 * 주의: 레이트리밋은 인메모리라 단일 인스턴스 기준이다. 다중 인스턴스 운영에서는
 * 공유 저장소(Redis) 기반으로 교체한다.
 */

/**
 * 요청 로깅 — method·경로·상태·소요시간만 남긴다.
 * 쿼리스트링/본문/헤더는 PII·시크릿을 포함할 수 있어 남기지 않는다. 헬스체크는 제외.
 */
export function requestLogger() {
  return function logRequest(req: Request, res: Response, next: NextFunction): void {
    if (req.path.startsWith('/api/health')) {
      next();
      return;
    }
    const start = Date.now();
    // originalUrl 은 마운트 미들웨어에서 변형되지 않는다. 쿼리스트링(PII 우려)은 제외.
    const path = req.originalUrl.split('?')[0];
    const id = (req as Request & { id?: string }).id ?? '-';
    res.on('finish', () => {
      console.log(`[req] ${id} ${req.method} ${path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  };
}

/** JSON API 용 보안 응답 헤더. */
export function securityHeaders(isProduction: boolean) {
  return function setSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.removeHeader('X-Powered-By');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  };
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  /** 리미터 구분 접두사 — 공유 저장소(Redis)에서 리미터 간 카운터 충돌 방지. */
  keyPrefix?: string;
}

/**
 * 레이트리밋 카운터 저장소. 인메모리(단일 인스턴스)와 Redis(다중 인스턴스)를 교체한다.
 * hit 은 현재 윈도의 누적 횟수와 남은 시간(ms)을 반환한다.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
}

/** 인메모리 고정 윈도 카운터(단일 인스턴스 기본). */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
    const now = Date.now();
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (now > v.resetAt) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || now > entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return { count: 1, resetMs: windowMs };
    }
    entry.count += 1;
    return { count: entry.count, resetMs: Math.max(0, entry.resetAt - now) };
  }
}

/** IP 기준 고정 윈도 레이트리밋 미들웨어. store 미지정 시 인메모리. */
export function createRateLimiter(options: RateLimitOptions, store: RateLimitStore = new InMemoryRateLimitStore()) {
  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${options.keyPrefix ?? 'default'}:${ip}`;
    void store
      .hit(key, options.windowMs)
      .then(({ count, resetMs }) => {
        if (count > options.max) {
          res.setHeader('Retry-After', String(Math.ceil(resetMs / 1000)));
          res
            .status(429)
            .json({ error: options.message ?? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
          return;
        }
        next();
      })
      // 레이트리밋 저장소 오류가 요청 자체를 막지 않도록 통과(가용성 우선).
      .catch(() => next());
  };
}
