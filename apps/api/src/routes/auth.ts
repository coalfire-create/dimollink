import type { AuthSession } from '@dimol/shared';
import { Router, type Request } from 'express';
import { OtpError, OtpService } from '../auth/otp-service.js';
import { SessionTokenStore } from '../auth/session-store.js';
import { UserStore } from '../users/store.js';

/**
 * 인증 라우트 — 휴대폰 OTP 로그인 + 세션 토큰(자동 로그인).
 * 흐름: 인증코드 요청 → 코드 검증 → (기존 회원)로그인 세션 발급 / (미가입)회원가입 안내.
 * 휴대폰번호·코드·토큰은 보안 값 — 응답/로그에 불필요하게 노출하지 않는다.
 */

const OTP_ERROR_STATUS: Record<string, number> = {
  NOT_REQUESTED: 400,
  EXPIRED: 400,
  INVALID_CODE: 401,
  TOO_MANY_ATTEMPTS: 429,
  RESEND_COOLDOWN: 429,
};

/** Authorization: Bearer <token> 에서 토큰 추출. */
export function bearerToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function createAuthRouter(
  userStore: UserStore,
  otpService: OtpService,
  sessionStore: SessionTokenStore,
): Router {
  const router = Router();

  // POST /api/auth/otp/request  { phone } — 인증코드 발송
  router.post('/auth/otp/request', async (req, res) => {
    const phone = (req.body as { phone?: unknown } | undefined)?.phone;
    if (typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
      res.status(400).json({ error: '휴대폰번호를 정확히 입력해 주세요.' });
      return;
    }
    try {
      res.json(await otpService.request(phone));
    } catch (err) {
      if (err instanceof OtpError) {
        res.status(OTP_ERROR_STATUS[err.code] ?? 400).json({ error: err.message, code: err.code });
        return;
      }
      console.error('[auth] OTP 발송 오류', err);
      res.status(502).json({ error: '인증코드 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  });

  // POST /api/auth/otp/verify  { phone, code } — 코드 검증 → 로그인 세션 or 가입 안내
  router.post('/auth/otp/verify', (req, res) => {
    const body = (req.body ?? {}) as { phone?: unknown; code?: unknown };
    if (typeof body.phone !== 'string' || typeof body.code !== 'string') {
      res.status(400).json({ error: 'phone·code(문자열)가 필요합니다.' });
      return;
    }
    try {
      otpService.verify(body.phone, body.code);
    } catch (err) {
      if (err instanceof OtpError) {
        res.status(OTP_ERROR_STATUS[err.code] ?? 400).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
      return;
    }

    const user = userStore.getByPhone(body.phone);
    if (!user) {
      // 번호 인증은 됐지만 미가입 → 회원가입으로 진행(가입 시 번호 인증 상태 소진).
      res.json({ phoneVerified: true, session: null });
      return;
    }
    const token = sessionStore.issue(user.id);
    const session: AuthSession = { token, user };
    res.json({ phoneVerified: true, session });
  });

  // GET /api/auth/me — 토큰으로 세션 복원(자동 로그인)
  router.get('/auth/me', (req, res) => {
    const token = bearerToken(req);
    const userId = token ? sessionStore.resolve(token) : undefined;
    const user = userId ? userStore.get(userId) : undefined;
    if (!user) {
      res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해 주세요.' });
      return;
    }
    res.json(user);
  });

  // POST /api/auth/logout — 토큰 회수
  router.post('/auth/logout', (req, res) => {
    const token = bearerToken(req);
    if (token) sessionStore.revoke(token);
    res.json({ ok: true });
  });

  return router;
}
