import { Platform } from 'react-native';
import type {
  AppNotification,
  AuthSession,
  CallAvailability,
  CancellationStage,
  ChatMessage,
  GeoPoint,
  MarketRate,
  MatchStatus,
  OtpRequestResult,
  OtpVerifyResult,
  ProviderJobs,
  ProviderRole,
  Quote,
  RatingSummary,
  RequestKind,
  ServiceRequest,
  SettlementPlan,
  UserApprovalStatus,
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

/** 일감 수락(선착순) → 매칭 확정. amount 를 주면 그 금액이 합의 금액(선결제 기준). */
export const acceptJob = (requestId: string, amount?: number) =>
  api<ServiceRequest>(`/jobs/${requestId}/accept`, {
    method: 'POST',
    body: JSON.stringify(amount !== undefined ? { amount } : {}),
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

/** 요청 상태 진행 (업체: 작업 시작/완료 등). 참여자만 가능. */
export const updateRequestStatus = (id: string, status: MatchStatus) =>
  api<ServiceRequest>(`/requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
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

// ── 견적 (처리장 견적 비교 등 · Phase 3)
/** 업체가 요청에 견적 제출(제출자는 인증된 본인). party: TRANSPORT | DISPOSAL. */
export const submitQuote = (input: { requestId: string; party: ProviderRole; amount: number; memo?: string }) =>
  api<Quote>('/quotes', { method: 'POST', body: JSON.stringify(input) });

/** 요청의 견적 목록(가격 비교용). */
export const listQuotes = (requestId: string) =>
  api<Quote[]>(`/quotes?requestId=${encodeURIComponent(requestId)}`);

/** 배출자(요청자 본인)가 견적 수락 → 정산 금액 확정. */
export const acceptQuote = (quoteId: string) =>
  api<Quote>(`/quotes/${quoteId}/accept`, { method: 'POST', body: '{}' });

// ── 결제 (선결제/취소)
export interface PrepayResult {
  plan: SettlementPlan;
  prepayment: { paymentId: string; [k: string]: unknown };
}
/** 선결제 — 정산 금액은 서버가 수락 견적에서 산출. completedDate=처리완료 예정일(YYYY-MM-DD). */
export const prepay = (input: { matchRequestId: string; completedDate: string; payMethod?: 'CARD' | 'VBANK' }) =>
  api<PrepayResult>('/payments/prepay', { method: 'POST', body: JSON.stringify(input) });

/** 취소/환불 — 결제자 본인만. stage 로 위약금 정책 결정. */
export const cancelPayment = (input: { paymentId: string; stage: CancellationStage; reason?: string }) =>
  api<{ breakdown: { refundAmount: number; penaltyAmount: number } }>('/payments/cancel', {
    method: 'POST',
    body: JSON.stringify(input),
  });

// ── 관리자 백오피스 (x-admin-token · Phase 5)
export const adminListUsers = (adminToken: string, approvalStatus?: UserApprovalStatus) =>
  api<UserProfile[]>(`/admin/users${approvalStatus ? `?approvalStatus=${approvalStatus}` : ''}`, {
    headers: { 'x-admin-token': adminToken },
  });

export const adminSetApproval = (adminToken: string, userId: string, status: UserApprovalStatus) =>
  api<UserProfile>(`/admin/users/${userId}/approval`, {
    method: 'PATCH',
    headers: { 'x-admin-token': adminToken },
    body: JSON.stringify({ status }),
  });

/** 정산 모니터링 — 상태별 요청 목록. */
export const adminListRequests = (adminToken: string, status?: MatchStatus) =>
  api<ServiceRequest[]>(`/admin/requests${status ? `?status=${status}` : ''}`, {
    headers: { 'x-admin-token': adminToken },
  });

/** 정산(지급대행) 실행 — 관리자 토큰. 금액·사업자번호는 서버 확정값. */
export const adminExecutePayout = (adminToken: string, matchRequestId: string, completedDate: string) =>
  api<{ settlementDate: string; payouts: unknown[]; taxInvoices: unknown[] }>('/payments/payouts', {
    method: 'POST',
    headers: { 'x-admin-token': adminToken },
    body: JSON.stringify({ matchRequestId, completedDate }),
  });
