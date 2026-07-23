import { describe, expect, it, vi } from 'vitest';
import { PROVIDERS } from './providers.js';
import { SignedPayload } from './signer.js';
import { OAuthService } from './oauth-service.js';

const baseConfig = {
  credentials: {
    kakao: { clientId: 'kakao-id', clientSecret: 'kakao-secret' },
    google: { clientId: 'google-id', clientSecret: 'google-secret' },
    naver: { clientId: 'naver-id', clientSecret: 'naver-secret' },
  },
  redirectBase: 'https://api.example.com',
  secret: 'test-secret',
};

describe('SignedPayload', () => {
  it('서명한 페이로드를 되돌려 검증한다', () => {
    const s = new SignedPayload('sekret');
    const token = s.sign({ hello: 'world' }, 60_000);
    expect(s.verify<{ hello: string }>(token)?.hello).toBe('world');
  });

  it('변조된 토큰은 거부한다', () => {
    const s = new SignedPayload('sekret');
    const token = s.sign({ a: 1 }, 60_000);
    expect(s.verify(token + 'x')).toBeUndefined();
  });

  it('다른 시크릿으로는 검증되지 않는다', () => {
    const token = new SignedPayload('secret-a').sign({ a: 1 }, 60_000);
    expect(new SignedPayload('secret-b').verify(token)).toBeUndefined();
  });

  it('만료된 토큰은 거부한다', () => {
    let t = 1_000_000;
    const s = new SignedPayload('sekret', () => t);
    const token = s.sign({ a: 1 }, 1_000);
    t += 2_000;
    expect(s.verify(token)).toBeUndefined();
  });
});

describe('providers.parseIdentity', () => {
  it('kakao: id/이메일/닉네임을 정규화한다', () => {
    const id = PROVIDERS.kakao.parseIdentity({
      id: 123456,
      kakao_account: { email: 'k@example.com', profile: { nickname: '카카오유저' } },
    });
    expect(id).toEqual({ providerUserId: '123456', email: 'k@example.com', name: '카카오유저' });
  });

  it('google: sub/이메일/이름을 정규화한다', () => {
    const id = PROVIDERS.google.parseIdentity({ sub: 'g-sub-1', email: 'g@example.com', name: 'G User' });
    expect(id).toEqual({ providerUserId: 'g-sub-1', email: 'g@example.com', name: 'G User' });
  });

  it('naver: response.id 를 정규화한다', () => {
    const id = PROVIDERS.naver.parseIdentity({
      response: { id: 'n-1', email: 'n@example.com', name: '네이버' },
    });
    expect(id).toEqual({ providerUserId: 'n-1', email: 'n@example.com', name: '네이버' });
  });

  it('필수 id 가 없으면 예외', () => {
    expect(() => PROVIDERS.kakao.parseIdentity({})).toThrow();
    expect(() => PROVIDERS.naver.parseIdentity({ response: {} })).toThrow();
  });
});

describe('OAuthService', () => {
  it('인가 URL 에 client_id·redirect_uri·state·scope 를 담는다', () => {
    const svc = new OAuthService(baseConfig);
    const { authorizeUrl, state } = svc.buildAuthorize('google');
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('google-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.example.com/api/auth/oauth/google/callback',
    );
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe(state);
  });

  it('state 는 발급한 공급자에서만 검증된다(CSRF)', () => {
    const svc = new OAuthService(baseConfig);
    const { state } = svc.buildAuthorize('kakao');
    expect(svc.verifyState('kakao', state)).toBe(true);
    expect(svc.verifyState('naver', state)).toBe(false);
    expect(svc.verifyState('kakao', 'forged')).toBe(false);
  });

  it('code → access token → 사용자정보 를 정규화해 반환한다', async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u === PROVIDERS.kakao.tokenUrl) {
        return new Response(JSON.stringify({ access_token: 'AT-1' }), { status: 200 });
      }
      if (u === PROVIDERS.kakao.userInfoUrl) {
        return new Response(
          JSON.stringify({ id: 999, kakao_account: { email: 'x@k.com', profile: { nickname: '홍길동' } } }),
          { status: 200 },
        );
      }
      throw new Error('unexpected url ' + u);
    }) as unknown as typeof fetch;

    const svc = new OAuthService(baseConfig, fetchFn);
    const id = await svc.fetchIdentity('kakao', 'auth-code');
    expect(id).toEqual({ providerUserId: '999', email: 'x@k.com', name: '홍길동' });

    // 토큰 교환 바디에 code·client_secret 이 포함되고, userinfo 는 Bearer 로 조회된다.
    const [, tokenInit] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((tokenInit as RequestInit).body).toContain('code=auth-code');
    expect((tokenInit as RequestInit).body).toContain('client_secret=kakao-secret');
    const [, infoInit] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[1];
    expect((infoInit as RequestInit).headers).toMatchObject({ Authorization: 'Bearer AT-1' });
  });

  it('토큰 교환이 실패하면 예외를 던진다', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const svc = new OAuthService(baseConfig, fetchFn);
    await expect(svc.fetchIdentity('google', 'bad')).rejects.toThrow();
  });

  it('가입 티켓을 발급·검증한다', () => {
    const svc = new OAuthService(baseConfig);
    const ticket = svc.issueSignupTicket('naver', { providerUserId: 'n-77', email: 'a@n.com', name: '박' });
    expect(svc.verifySignupTicket(ticket)).toEqual({
      provider: 'naver',
      providerUserId: 'n-77',
      email: 'a@n.com',
      name: '박',
    });
    expect(svc.verifySignupTicket('garbage')).toBeUndefined();
  });

  it('자격증명/시크릿이 없으면 isConfigured=false', () => {
    const svc = new OAuthService({ ...baseConfig, credentials: {} });
    expect(svc.isConfigured('kakao')).toBe(false);
    const noSecret = new OAuthService({ ...baseConfig, secret: '' });
    expect(noSecret.isConfigured('kakao')).toBe(false);
    expect(new OAuthService(baseConfig).isConfigured('kakao')).toBe(true);
  });
});
