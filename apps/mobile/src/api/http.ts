import { Platform } from 'react-native';

/**
 * API 호출 공통 인프라 — 베이스 URL, 오류 타입, 세션 토큰, fetch 래퍼.
 *
 * 도메인별 호출은 같은 폴더의 모듈들(auth·requests·payments…)에 있고, 모두 이 파일의
 * `api()` 를 쓴다. 인증 헤더와 401 처리가 한 곳에만 있어야 도메인이 늘어도 규칙이
 * 갈라지지 않는다.
 */

/**
 * - 오류 응답의 `error`(한글 문구)는 그대로 사용자에게 노출 가능하다 — ApiError.message 로 전달.
 * - Android 에뮬레이터는 호스트 루프백이 10.0.2.2 이므로 플랫폼별로 베이스 URL을 나눈다.
 */
const HOST = Platform.select({ android: '10.0.2.2', default: 'localhost' });
const isWeb = Platform.OS === 'web';
/**
 * 운영(release) 빌드가 접속할 백엔드 API 주소. 기본값은 Railway 운영 서비스.
 * 커스텀 도메인(api.디몰링크.com 등)으로 옮길 땐 코드 수정 없이 빌드 시
 * EXPO_PUBLIC_API_BASE_URL 환경변수로 오버라이드한다.
 */
const PROD_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://demolink-api-production.up.railway.app/api';
/**
 * 베이스 URL 선택:
 *  - 웹 운영: 동일 오리진의 '/api' (정적 호스팅 리다이렉트).
 *  - 개발(__DEV__): 로컬 서버(에뮬레이터는 10.0.2.2).
 *  - 네이티브 운영(안드로이드/iOS 릴리스): Railway 운영 API.
 */
export const API_BASE_URL =
  isWeb && !__DEV__ ? '/api' : __DEV__ ? `http://${HOST}:4000/api` : PROD_API_BASE_URL;

/**
 * 웹 페이지(약관·개인정보처리방침·랜딩) 베이스 — API 와 동일 호스트의 루트(/api 제외).
 * Express 가 /privacy·/terms 를 서빙하므로 앱에서 이 주소로 링크한다.
 */
export const WEB_BASE_URL = API_BASE_URL.replace(/\/api$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * 로그인 세션 토큰 — 로그인/자동로그인 시 저장되고, 이후 모든 인증 요청에 자동 첨부된다.
 * App 이 로그인/복원 시 setAuthToken(token), 로그아웃 시 setAuthToken(null) 을 호출한다.
 */
let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/**
 * 세션 만료(401) 처리 콜백 — 로그인 상태에서 인증 실패 시 호출된다.
 * App 이 로그아웃(게이트 복귀)에 연결한다.
 */
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        // 토큰이 있으면 자동 첨부(개별 호출이 명시한 헤더가 우선).
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.', 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // 로그인 상태에서 401 → 세션 만료로 보고 로그아웃 유도.
    if (res.status === 401 && authToken) onUnauthorized?.();
    const message = typeof body.error === 'string' ? body.error : '요청 처리에 실패했습니다.';
    throw new ApiError(message, res.status);
  }
  return body as T;
}
