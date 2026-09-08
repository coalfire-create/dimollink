import { createHash, timingSafeEqual } from 'node:crypto';
import { isAdminUser, type UserProfile } from '@dimol/shared';
import type { NextFunction, Request, Response } from 'express';

/**
 * 관리자 백오피스 가드 (로드맵 Phase 5).
 *
 * 두 경로를 받는다:
 * 1. **관리자 계정 로그인**(권장) — `Authorization: Bearer <세션토큰>` 으로 들어온
 *    회원의 role 이 ADMIN 인지 본다. 행위가 사람에게 귀속되고, 한 사람만 회수할 수 있다.
 * 2. **공유 운영 토큰**(`x-admin-token`) — 첫 관리자를 만들 때와, 계정이 잠겼을 때의
 *    비상 경로. 누가 썼는지 남지 않으므로 상시 사용은 권하지 않는다. 그래도 남겨두는
 *    이유는, 이걸 없애면 관리자 계정을 잃었을 때 백오피스로 들어갈 길이 사라지기 때문이다.
 *
 * 둘 다 불가하면 401. 토큰 값은 로그·응답에 남기지 않는다.
 */

/** 요청자를 세션 토큰으로 조회한다. 없으면 undefined. */
export type AdminUserLookup = (req: Request) => Promise<UserProfile | undefined>;

export interface AdminAuthOptions {
  /** 공유 운영 토큰(ADMIN_TOKEN). 미설정이면 이 경로는 닫힌다. */
  token?: string;
  /** 세션 → 회원 조회. 미제공이면 계정 경로는 닫힌다(구버전 호환). */
  lookupUser?: AdminUserLookup;
}

export function createAdminAuth(
  optionsOrToken: AdminAuthOptions | string | undefined,
) {
  const options: AdminAuthOptions =
    typeof optionsOrToken === 'string' || optionsOrToken === undefined
      ? { token: optionsOrToken }
      : optionsOrToken;
  const { token: expectedToken, lookupUser } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      // 1) 관리자 계정. 여기를 먼저 보는 이유는, 통과하면 누가 했는지가 남기 때문이다.
      if (lookupUser) {
        const user = await lookupUser(req);
        if (user && isAdminUser(user)) {
          (req as AdminRequest).adminUser = user;
          next();
          return;
        }
      }

      // 2) 공유 운영 토큰(비상·부트스트랩).
      if (expectedToken) {
        const provided = req.header('x-admin-token');
        if (typeof provided === 'string' && tokenMatches(provided, expectedToken)) {
          next();
          return;
        }
      }

      if (!expectedToken && !lookupUser) {
        res.status(503).json({ error: '백오피스가 비활성 상태입니다 (ADMIN_TOKEN 미설정).' });
        return;
      }
      res.status(401).json({ error: '관리자 인증에 실패했습니다.' });
    })().catch(next);
  };
}

export interface AdminRequest extends Request {
  /** 계정으로 통과했을 때의 관리자. 공유 토큰으로 통과하면 없다(그래서 추적이 안 된다). */
  adminUser?: UserProfile;
}

/** 이 요청을 수행한 관리자. 공유 토큰 경로면 undefined — 감사 로그에 그대로 남긴다. */
export function adminActor(req: Request): UserProfile | undefined {
  return (req as AdminRequest).adminUser;
}

/** 길이 노출 없는 상수 시간 비교 (해시 후 timingSafeEqual). */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
