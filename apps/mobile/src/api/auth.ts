import type {
  AuthSession,
  CallAvailability,
  GeoPoint,
  OtpRequestResult,
  OtpVerifyResult,
  RatingSummary,
  SocialProvider,
  UserProfile,
  UserType,
} from '@dimol/shared';
import { api } from './http';

/**
 * 인증 · 소셜 로그인 · 회원 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 인증 (휴대폰 OTP 로그인 · Phase 1)
/** 인증코드 발송 요청. */
export const requestOtp = (phone: string) =>
  api<OtpRequestResult>('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });

/** 인증코드 검증 → 기존 회원이면 session, 미가입이면 phoneVerified만 true. */
export const verifyOtp = (phone: string, code: string) =>
  api<OtpVerifyResult>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });

/** 번호+비밀번호 로그인 → 세션(토큰+프로필). OTP 불필요. */
export const login = (phone: string, password: string) =>
  api<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) });

/** 저장된 토큰으로 세션 복원(자동 로그인). */
export const getMe = (token: string) =>
  api<UserProfile>('/auth/me', { headers: { authorization: `Bearer ${token}` } });

// ── 소셜 로그인 (카카오/구글/네이버 OAuth)
/**
 * 소셜 로그인 인가 URL 요청. 반환된 authorizeUrl 을 브라우저로 열어 인증을 진행한다.
 * 공급자 미설정 시 503(ApiError) — 화면에서 안내 문구로 노출한다.
 */
export const fetchSocialAuthorizeUrl = (provider: SocialProvider) =>
  api<{ authorizeUrl: string }>(`/auth/oauth/${provider}/start`);

/** 서버 토큰 회수(로그아웃). 실패해도 로컬 세션은 정리한다. */
export const logoutServer = (token: string) =>
  api<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });

// ── 회원 (Phase 1)
export interface CreateUserInput {
  userType: UserType;
  name: string;
  /** 전국구 서비스 — 활동 지역은 입력받지 않는다(서버가 '전국' 기본값). */
  region?: string;
  /** OTP 인증을 마친 휴대폰번호(필수 · 로그인 식별자). */
  phone: string;
  /** 번호+비밀번호 로그인용(소셜 가입이 아니면 필수 · 6자 이상). */
  password?: string;
  businessNumber?: string;
  /** 업체 기준 좌표(거리 기반 일감 추천용, 선택). */
  location?: GeoPoint;
  /** 소셜 로그인으로 진입한 가입이면 콜백에서 받은 티켓 — 계정에 소셜 신원을 연결한다. */
  socialTicket?: string;
}

/** 회원가입 → 세션(토큰+프로필) 반환. 가입 즉시 로그인 상태가 된다. */
export const createUser = (input: CreateUserInput) =>
  api<AuthSession>('/users', { method: 'POST', body: JSON.stringify(input) });

export const getUser = (id: string) => api<UserProfile>(`/users/${id}`);

/** 운반업체 콜대기 상태 토글 (ONLINE=대기, OFFLINE=종료). */
export const setAvailability = (userId: string, availability: CallAvailability, radiusKm?: number) =>
  api<UserProfile>(`/users/${userId}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ availability, radiusKm }),
  });

/** 처리장 운반요청 제공 여부 토글 (true=운반요청 가능, false=운반 별도). */
export const setOffersTransport = (userId: string, offersTransport: boolean) =>
  api<UserProfile>(`/users/${userId}/offers-transport`, {
    method: 'PATCH',
    body: JSON.stringify({ offersTransport }),
  });

export const getRating = (userId: string) => api<RatingSummary>(`/users/${userId}/rating`);

export const listUsers = (params?: { userType?: string; approvalStatus?: string }) => {
  const query = new URLSearchParams();
  if (params?.userType) query.set('userType', params.userType);
  if (params?.approvalStatus) query.set('approvalStatus', params.approvalStatus);
  const qStr = query.toString();
  return api<UserProfile[]>(`/users${qStr ? `?${qStr}` : ''}`);
};
