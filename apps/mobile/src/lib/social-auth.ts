import { Linking } from 'react-native';
import type { SocialProvider } from '@dimol/shared';
import { fetchSocialAuthorizeUrl } from '../api/client';

/**
 * 소셜 로그인(카카오/구글/네이버) 클라이언트 헬퍼.
 * 흐름: 인가 URL 취득 → 브라우저로 열기 → 서버 콜백이 앱 딥링크(dimollink://auth?...)로 복귀 → parseAuthDeepLink.
 *
 * ⚠️ 딥링크가 동작하려면 네이티브 URL 스킴(iOS Info.plist CFBundleURLSchemes,
 *    Android intent-filter android:scheme="dimollink")과 서버 OAUTH_APP_REDIRECT 등록이 필요하다.
 */

/** 콜백 복귀 딥링크 스킴. 서버 OAUTH_APP_REDIRECT 와 일치시킨다. */
export const SOCIAL_RETURN_SCHEME = 'dimollink://auth';

export type SocialAuthResult =
  | { status: 'login'; token: string }
  | { status: 'signup'; ticket: string; provider?: SocialProvider; name?: string; email?: string }
  | { status: 'cancelled'; provider?: SocialProvider }
  | null;

function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    try {
      const key = decodeURIComponent(pair.slice(0, eq));
      const value = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
      out[key] = value;
    } catch {
      // 잘못된 인코딩은 건너뛴다.
    }
  }
  return out;
}

/**
 * 콜백 딥링크 URL 파싱 — `dimollink://auth?status=...` 만 처리한다.
 * 인식 불가/필수값 누락이면 null(무시).
 */
export function parseAuthDeepLink(url: string): SocialAuthResult {
  if (!url || !url.includes('://auth')) return null;
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const p = parseQuery(url.slice(qIndex + 1));
  const provider = (p.provider as SocialProvider) || undefined;
  switch (p.status) {
    case 'login':
      return p.token ? { status: 'login', token: p.token } : null;
    case 'signup':
      return p.ticket
        ? { status: 'signup', ticket: p.ticket, provider, name: p.name || undefined, email: p.email || undefined }
        : null;
    case 'cancelled':
      return { status: 'cancelled', provider };
    default:
      return null;
  }
}

/** 소셜 로그인 시작 — 인가 URL 을 받아 시스템 브라우저로 연다. 실패는 호출측에서 처리. */
export async function startSocialLogin(provider: SocialProvider): Promise<void> {
  const { authorizeUrl } = await fetchSocialAuthorizeUrl(provider);
  await Linking.openURL(authorizeUrl);
}
