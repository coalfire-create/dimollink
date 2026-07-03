import type { UserProfile } from '@dimol/shared';
import type { NextFunction, Request, Response } from 'express';
import type { SessionTokenStore } from '../auth/session-store.js';
import { bearerToken } from '../routes/auth.js';
import type { UserStore } from '../users/store.js';

/**
 * 세션 토큰 인증 미들웨어.
 * Authorization: Bearer <token> 를 검증해 요청자(회원)를 req.authUser 에 붙인다.
 * 토큰이 없거나 무효/만료면 401. 이후 핸들러는 authUserId(req) 로 요청자 본인 여부를 확인한다.
 */

export interface AuthedRequest extends Request {
  authUser: UserProfile;
}

export function createRequireAuth(sessionStore: SessionTokenStore, userStore: UserStore) {
  return function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const token = bearerToken(req);
    const userId = token ? sessionStore.resolve(token) : undefined;
    const user = userId ? userStore.get(userId) : undefined;
    if (!user) {
      res.status(401).json({ error: '로그인이 필요합니다.' });
      return;
    }
    (req as AuthedRequest).authUser = user;
    next();
  };
}

/** 인증된 요청자. requireAuth 통과 후에만 호출한다. */
export function authUser(req: Request): UserProfile {
  const user = (req as AuthedRequest).authUser;
  if (!user) throw new Error('authUser 는 requireAuth 이후에만 사용할 수 있습니다.');
  return user;
}

/** 인증된 요청자 id. */
export function authUserId(req: Request): string {
  return authUser(req).id;
}
