import { Platform } from 'react-native';
import type {
  AppNotification,
  AuthSession,
  CallAvailability,
  ChatMessage,
  GeoPoint,
  MarketRate,
  OtpRequestResult,
  OtpVerifyResult,
  ProviderJobs,
  ProviderRole,
  RatingSummary,
  RequestKind,
  ServiceRequest,
  UserProfile,
  UserType,
  VolumeEstimate,
} from '@dimol/shared';

/**
 * 백엔드 API 클라이언트.
 * - 오류 응답의 `error`(한글 문구)는 그대로 사용자에게 노출 가능하다 — ApiError.message 로 전달.
 * - Android 에뮬레이터는 호스트 루프백이 10.0.2.2 이므로 플랫폼별로 베이스 URL을 나눈다.
 */
const HOST = Platform.select({ android: '10.0.2.2', default: 'localhost' });
const isWeb = Platform.OS === 'web';
export const API_BASE_URL = (isWeb && !__DEV__) ? '/api' : `http://${HOST}:4000/api`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.', 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof body.error === 'string' ? body.error : '요청 처리에 실패했습니다.';
    throw new ApiError(message, res.status);
  }
  return body as T;
}

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

/** 저장된 토큰으로 세션 복원(자동 로그인). */
export const getMe = (token: string) =>
  api<UserProfile>('/auth/me', { headers: { authorization: `Bearer ${token}` } });

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
  region: string;
  /** OTP 인증을 마친 휴대폰번호(필수 · 로그인 식별자). */
  phone: string;
  businessNumber?: string;
  /** 업체 기준 좌표(거리 기반 일감 추천용, 선택). */
  location?: GeoPoint;
}

/** 회원가입 → 세션(토큰+프로필) 반환. 가입 즉시 로그인 상태가 된다. */
export const createUser = (input: CreateUserInput) =>
  api<AuthSession>('/users', { method: 'POST', body: JSON.stringify(input) });

export const getUser = (id: string) => api<UserProfile>(`/users/${id}`);

/** 운반업체 콜대기 상태 토글 (ONLINE=대기, OFFLINE=종료). */
export const setAvailability = (userId: string, availability: CallAvailability) =>
  api<UserProfile>(`/users/${userId}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ availability }),
  });

export const getRating = (userId: string) => api<RatingSummary>(`/users/${userId}/rating`);

// ── 업체 일감 (Phase 1 — 수신·수락)
/** 내 유형·지역의 새 일감(open) + 내가 수락한 일감(assigned). */
export const listJobs = (providerId: string) =>
  api<ProviderJobs>(`/jobs?providerId=${encodeURIComponent(providerId)}`);

/** 일감 수락 → 매칭 확정된 요청 반환. */
export const acceptJob = (requestId: string, providerId: string) =>
  api<ServiceRequest>(`/jobs/${requestId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ providerId }),
  });

// ── 서비스 요청 (Phase 1)
export interface CreateRequestInput {
  kind: RequestKind;
  requesterId: string;
  region: string;
  wasteCategory: string;
  wasteTons: number;
  allbaroRequested: boolean;
  /** 현장 좌표(거리 기반 매칭용, 선택). */
  location?: GeoPoint;
  siteAddress?: string;
  loadAddress?: string;
  unloadAddress?: string;
  visitAt?: string;
}

export const createRequest = (input: CreateRequestInput) =>
  api<ServiceRequest>('/requests', { method: 'POST', body: JSON.stringify(input) });

export const listRequests = (requesterId: string) =>
  api<ServiceRequest[]>(`/requests?requesterId=${encodeURIComponent(requesterId)}`);

export const getRequest = (id: string) => api<ServiceRequest>(`/requests/${id}`);

export const cancelRequest = (id: string, cancelReason: string) =>
  api<ServiceRequest>(`/requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'CANCELLED', cancelReason }),
  });

// ── 시세 (Phase 3)
export const getMarketRate = (party: ProviderRole) =>
  api<MarketRate>(`/quotes/market-rate?party=${party}`);

// ── 알림 (Phase 4)
export const listNotifications = (userId: string) =>
  api<AppNotification[]>(`/notifications?userId=${encodeURIComponent(userId)}`);

// ── 채팅 (Phase 4)
export const listMessages = (requestId: string, viewerId: string, since?: string) =>
  api<ChatMessage[]>(
    `/requests/${requestId}/messages?viewerId=${encodeURIComponent(viewerId)}` +
      (since ? `&since=${encodeURIComponent(since)}` : ''),
  );

export const sendMessage = (requestId: string, senderId: string, content: string) =>
  api<ChatMessage>(`/requests/${requestId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ senderId, content }),
  });

// ── 물량 추정 (Phase 6)
export const estimateVolume = (input: { floorAreaM2: number; structure?: string }) =>
  api<VolumeEstimate>('/estimation/volume', { method: 'POST', body: JSON.stringify(input) });
