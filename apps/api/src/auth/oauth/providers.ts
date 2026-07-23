import type { SocialProvider } from '@dimol/shared';

/**
 * 소셜 공급자별 OAuth 2.0 엔드포인트 + 사용자정보 파서.
 * 카카오/구글/네이버는 모두 authorization-code 흐름을 쓰되 userinfo 응답 스키마가 달라
 * parseIdentity 로 공통 형태(NormalizedIdentity)로 정규화한다.
 */

export interface NormalizedIdentity {
  /** 공급자의 안정적 고유 사용자 id — 로그인 매칭 키. */
  providerUserId: string;
  email?: string;
  name?: string;
}

export interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  /** 인가 스코프(공백 구분). 네이버는 콘솔에서 지정하므로 비움. */
  scope: string;
  parseIdentity(userInfo: unknown): NormalizedIdentity;
}

export const PROVIDERS: Record<SocialProvider, ProviderConfig> = {
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    userInfoUrl: 'https://kapi.kakao.com/v2/user/me',
    scope: 'account_email profile_nickname',
    parseIdentity(userInfo) {
      const info = userInfo as {
        id?: number | string;
        kakao_account?: { email?: string; profile?: { nickname?: string } };
      };
      if (info.id === undefined || info.id === null) throw new Error('kakao: id 누락');
      return {
        providerUserId: String(info.id),
        email: info.kakao_account?.email,
        name: info.kakao_account?.profile?.nickname,
      };
    },
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    parseIdentity(userInfo) {
      const info = userInfo as { sub?: string; email?: string; name?: string };
      if (!info.sub) throw new Error('google: sub 누락');
      return { providerUserId: info.sub, email: info.email, name: info.name };
    },
  },
  naver: {
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    userInfoUrl: 'https://openapi.naver.com/v1/nid/me',
    scope: '',
    parseIdentity(userInfo) {
      const info = userInfo as {
        response?: { id?: string; email?: string; name?: string; nickname?: string };
      };
      const r = info.response;
      if (!r?.id) throw new Error('naver: response.id 누락');
      return { providerUserId: r.id, email: r.email, name: r.name ?? r.nickname };
    },
  },
};
