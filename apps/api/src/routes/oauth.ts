import { isSocialProvider, SOCIAL_PROVIDER_LABELS } from '@dimol/shared';
import { Router } from 'express';
import type { OtpService } from '../auth/otp-service.js';
import type { OAuthService } from '../auth/oauth/oauth-service.js';
import type { SessionStore } from '../auth/session-store.js';
import { UserStore } from '../users/store.js';
import { bearerToken } from './auth.js';

/**
 * 소셜 로그인 라우트 — 카카오/구글/네이버 OAuth 2.0 (authorization-code).
 *
 * 흐름:
 *  1) GET /auth/oauth/:provider/start → 인가 URL. 단말이 브라우저로 연다.
 *  2) 공급자 인증 후 GET /auth/oauth/:provider/callback 으로 리다이렉트(code, state).
 *  3) 신원 조회 → (연결된 계정)세션 발급 / (미가입)가입 티켓 발급.
 *  4) 앱 딥링크로 복귀(status=login&token / status=signup&ticket). 딥링크 미설정 시 JSON 반환(웹/테스트).
 *
 * 미가입 신원은 회원가입(POST /users, 휴대폰 인증 필수)에서 socialTicket 으로 계정에 연결한다.
 * 토큰·티켓은 보안 값 — 로그에 남기지 않는다.
 */
export function createOAuthRouter(
  userStore: UserStore,
  _otpService: OtpService,
  sessionStore: SessionStore,
  oauth: OAuthService,
  /** 콜백 후 앱으로 복귀할 딥링크(예: dimollink://auth). 미설정 시 콜백이 JSON 을 반환. */
  appRedirect = '',
): Router {
  const router = Router();

  function backToApp(
    res: import('express').Response,
    params: Record<string, string>,
  ): void {
    if (appRedirect) {
      const sep = appRedirect.includes('?') ? '&' : '?';
      res.redirect(`${appRedirect}${sep}${new URLSearchParams(params).toString()}`);
      return;
    }
    // 딥링크 미설정(웹/로컬 테스트): 결과를 JSON 으로 돌려준다.
    res.json(params);
  }

  // GET /auth/oauth/:provider/start — 인가 URL 발급. ?redirect=1 이면 302 로 바로 이동.
  router.get('/auth/oauth/:provider/start', (req, res) => {
    const provider = req.params.provider;
    if (!isSocialProvider(provider)) {
      res.status(404).json({ error: '지원하지 않는 로그인입니다.' });
      return;
    }
    if (!oauth.isConfigured(provider)) {
      res
        .status(503)
        .json({ error: `${SOCIAL_PROVIDER_LABELS[provider]} 로그인이 아직 설정되지 않았습니다.` });
      return;
    }
    const { authorizeUrl } = oauth.buildAuthorize(provider);
    if (req.query.redirect === '1') {
      res.redirect(authorizeUrl);
      return;
    }
    res.json({ authorizeUrl });
  });

  // GET /auth/oauth/:provider/callback — 공급자 리다이렉트 수신.
  router.get('/auth/oauth/:provider/callback', async (req, res) => {
    const provider = req.params.provider;
    if (!isSocialProvider(provider) || !oauth.isConfigured(provider)) {
      res.status(404).send('not found');
      return;
    }
    const { code, state, error } = req.query;
    if (error) {
      // 사용자가 동의를 취소한 경우 등.
      backToApp(res, { status: 'cancelled', provider });
      return;
    }
    if (typeof code !== 'string' || typeof state !== 'string' || !oauth.verifyState(provider, state)) {
      res.status(400).send('잘못된 로그인 요청입니다. 다시 시도해 주세요.');
      return;
    }

    let identity;
    try {
      identity = await oauth.fetchIdentity(provider, code);
    } catch (err) {
      console.warn('[oauth] 신원 조회 실패', provider, err instanceof Error ? err.name : 'error');
      res.status(502).send('로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const existing = await userStore.getBySocialIdentity(provider, identity.providerUserId);
    if (existing) {
      const token = await sessionStore.issue(existing.id);
      backToApp(res, { status: 'login', token });
      return;
    }

    // 미가입 신원 → 가입 티켓 + 프리필로 회원가입 유도(휴대폰 인증은 가입에서 수행).
    const ticket = oauth.issueSignupTicket(provider, identity);
    backToApp(res, {
      status: 'signup',
      ticket,
      provider,
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.email ? { email: identity.email } : {}),
    });
  });

  // POST /auth/oauth/link — 로그인 상태에서 소셜 계정 연결. body: { ticket }
  router.post('/auth/oauth/link', async (req, res) => {
    const token = bearerToken(req);
    const userId = token ? await sessionStore.resolve(token) : undefined;
    if (!userId) {
      res.status(401).json({ error: '로그인이 필요합니다.' });
      return;
    }
    const ticket = (req.body as { ticket?: unknown } | undefined)?.ticket;
    const parsed = typeof ticket === 'string' ? oauth.verifySignupTicket(ticket) : undefined;
    if (!parsed) {
      res.status(400).json({ error: '연결 정보가 만료되었습니다. 다시 시도해 주세요.' });
      return;
    }
    const linkedElsewhere = await userStore.getBySocialIdentity(parsed.provider, parsed.providerUserId);
    if (linkedElsewhere && linkedElsewhere.id !== userId) {
      res.status(409).json({ error: '이미 다른 계정에 연결된 소셜 계정입니다.' });
      return;
    }
    const user = userStore.linkSocialIdentity(userId, {
      provider: parsed.provider,
      providerUserId: parsed.providerUserId,
      ...(parsed.email ? { email: parsed.email } : {}),
      linkedAt: new Date().toISOString(),
    });
    res.json({ user });
  });

  return router;
}
