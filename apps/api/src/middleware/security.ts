import type { NextFunction, Request, Response } from 'express';

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
    res.on('finish', () => {
      console.log(`[req] ${req.method} ${path} ${res.statusCode} ${Date.now() - start}ms`);
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
}

/** IP 기준 고정 윈도 레이트리밋 미들웨어. */
export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    // 만료 항목 정리(맵 무한 증가 방지).
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > options.max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res
        .status(429)
        .json({ error: options.message ?? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }
    next();
  };
}
