import { randomUUID } from 'node:crypto';
import { isSocialProvider, type OAuthStartResult, type SocialProvider } from '@dimol/shared';
import { PROVIDERS, type NormalizedIdentity } from './providers.js';
import { SignedPayload } from './signer.js';

/**
 * 소셜 OAuth 서비스 — 인가 URL 생성, code→신원 교환, state·가입티켓 서명/검증.
 * 외부 HTTP(fetch)는 주입 가능(테스트).
 *
 * 보안: client_secret 은 토큰 교환에만 쓰고 노출하지 않는다. state 로 CSRF 를 막는다.
 */

export class OAuthError extends Error {}

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthServiceConfig {
  credentials: Partial<Record<SocialProvider, OAuthClientCredentials>>;
  /** 콜백 베이스 URL. `${base}/api/auth/oauth/${provider}/callback` 로 조합(공급자 콘솔에 등록한 값과 일치해야 함). */
  redirectBase: string;
  /** state·티켓 서명 시크릿. 비면 서비스가 '미설정'으로 간주된다. */
  secret: string;
  stateTtlMs?: number;
  ticketTtlMs?: number;
}

interface StatePayload {
  p: SocialProvider;
  n: string;
}

interface TicketPayload {
  p: SocialProvider;
  uid: string;
  email?: string;
  name?: string;
}

export interface SignupTicket {
  provider: SocialProvider;
  providerUserId: string;
  email?: string;
  name?: string;
}

export class OAuthService {
  private readonly signer: SignedPayload;
  private readonly stateTtlMs: number;
  private readonly ticketTtlMs: number;

  constructor(
    private readonly config: OAuthServiceConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.signer = new SignedPayload(config.secret);
    this.stateTtlMs = config.stateTtlMs ?? 10 * 60 * 1000;
    this.ticketTtlMs = config.ticketTtlMs ?? 15 * 60 * 1000;
  }

  /** 공급자가 사용 가능(자격증명 + 서명 시크릿 + 콜백 베이스 설정)한지. */
  isConfigured(provider: SocialProvider): boolean {
    const c = this.config.credentials[provider];
    return Boolean(c?.clientId && c?.clientSecret && this.config.secret && this.config.redirectBase);
  }

  private redirectUri(provider: SocialProvider): string {
    return `${this.config.redirectBase.replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;
  }

  private requireCreds(provider: SocialProvider): OAuthClientCredentials {
    const c = this.config.credentials[provider];
    if (!c?.clientId || !c?.clientSecret) throw new OAuthError(`${provider} OAuth 자격증명 미설정`);
    return c;
  }

  /** 인가 URL + state 생성. */
  buildAuthorize(provider: SocialProvider): OAuthStartResult {
    const cfg = PROVIDERS[provider];
    const creds = this.requireCreds(provider);
    const state = this.signer.sign<StatePayload>({ p: provider, n: randomUUID() }, this.stateTtlMs);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: creds.clientId,
      redirect_uri: this.redirectUri(provider),
      state,
    });
    if (cfg.scope) params.set('scope', cfg.scope);
    return { authorizeUrl: `${cfg.authorizeUrl}?${params.toString()}`, state };
  }

  /** 콜백의 state 가 이 공급자에 대해 유효(서명·미만료)한지. */
  verifyState(provider: SocialProvider, state: string): boolean {
    const p = this.signer.verify<StatePayload>(state);
    return Boolean(p && p.p === provider);
  }

  /** authorization code → access token → 정규화된 신원. */
  async fetchIdentity(provider: SocialProvider, code: string): Promise<NormalizedIdentity> {
    const cfg = PROVIDERS[provider];
    const creds = this.requireCreds(provider);

    const tokenRes = await this.fetchFn(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: this.redirectUri(provider),
        code,
      }).toString(),
    });
    if (!tokenRes.ok) throw new OAuthError(`${provider} 토큰 교환 실패 (status=${tokenRes.status})`);
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new OAuthError(`${provider} access_token 누락`);

    const infoRes = await this.fetchFn(cfg.userInfoUrl, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!infoRes.ok) throw new OAuthError(`${provider} 사용자정보 조회 실패 (status=${infoRes.status})`);
    return cfg.parseIdentity(await infoRes.json());
  }

  /** 미가입 신원에 발급하는 단기 가입 티켓(회원가입 시 신원 재확인용). */
  issueSignupTicket(provider: SocialProvider, identity: NormalizedIdentity): string {
    return this.signer.sign<TicketPayload>(
      { p: provider, uid: identity.providerUserId, email: identity.email, name: identity.name },
      this.ticketTtlMs,
    );
  }

  /** 가입 티켓 검증 → 신원. 위조·만료면 undefined. */
  verifySignupTicket(ticket: string): SignupTicket | undefined {
    const p = this.signer.verify<TicketPayload>(ticket);
    if (!p || !isSocialProvider(p.p) || typeof p.uid !== 'string' || p.uid.length === 0) return undefined;
    return { provider: p.p, providerUserId: p.uid, email: p.email, name: p.name };
  }
}
