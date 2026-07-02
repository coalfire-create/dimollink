import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * 관리자 백오피스 가드 (로드맵 Phase 5).
 * `x-admin-token` 헤더를 ADMIN_TOKEN 환경변수와 비교한다.
 * - 토큰 미설정: 백오피스 전체 비활성 (503) — 실수로 무방비 노출되는 것을 막는다.
 * - 불일치: 401. 토큰 값은 로그·응답에 남기지 않는다.
 * 운영 규모가 커지면 관리자 계정/권한(RBAC) 체계로 교체한다.
 */
export function createAdminAuth(expectedToken: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expectedToken) {
      res.status(503).json({ error: '백오피스가 비활성 상태입니다 (ADMIN_TOKEN 미설정).' });
      return;
    }
    const provided = req.header('x-admin-token');
    if (typeof provided !== 'string' || !tokenMatches(provided, expectedToken)) {
      res.status(401).json({ error: '관리자 인증에 실패했습니다.' });
      return;
    }
    next();
  };
}

/** 길이 노출 없는 상수 시간 비교 (해시 후 timingSafeEqual). */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
