import { Platform } from 'react-native';
import type {
  AppNotification,
  AuthSession,
  CallAvailability,
  CancellationStage,
  ChatMessage,
  GeoPoint,
  InteriorBid,
  InteriorCategory,
  InteriorRequest,
  MarketRate,
  MatchStatus,
  OtpRequestResult,
  OtpVerifyResult,
  ProviderJobs,
  ProviderPricing,
  ProviderRole,
  Quote,
  RatingSummary,
  RequestKind,
  ServiceRequest,
  SettlementPlan,
  SiteAnalysis,
  SocialProvider,
  UserApprovalStatus,
  UserProfile,
  UserType,
  VolumeEstimate,
  WasteItem,
} from '@dimol/shared';

/**
 * 백엔드 API 클라이언트.
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
  isWeb && !__DEV__
    ? '/api'
    : __DEV__
      ? `http://${HOST}:4000/api`
      : PROD_API_BASE_URL;

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
export const setAvailability = (userId: string, availability: CallAvailability) =>
  api<UserProfile>(`/users/${userId}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ availability }),
  });

/** 처리장 운반요청 제공 여부 토글 (true=운반요청 가능, false=운반 별도). */
export const setOffersTransport = (userId: string, offersTransport: boolean) =>
  api<UserProfile>(`/users/${userId}/offers-transport`, {
    method: 'PATCH',
    body: JSON.stringify({ offersTransport }),
  });

export const getRating = (userId: string) => api<RatingSummary>(`/users/${userId}/rating`);

// ── 업체 단가 (Phase 2 — 마이페이지 설정)
/** 내 단가 조회(본인만). 미설정이면 null. */
export const getPricing = (userId: string) =>
  api<ProviderPricing | null>(`/pricing/${encodeURIComponent(userId)}`);
/** 내 단가 설정(본인만). */
export const setPricing = (userId: string, unitPrice: number) =>
  api<ProviderPricing>(`/pricing/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ unitPrice }),
  });

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
  /** 소재별 항목(종류+kg). 최소 1개. 서버가 wasteTons 를 합계에서 자동 산출한다. */
  wasteItems?: WasteItem[];
  /** 레거시(하위호환) — wasteItems 미지정 시에만 사용. */
  wasteTons?: number;
  allbaroRequested: boolean;
  /** 현장 좌표(거리 기반 매칭용, 선택). */
  location?: GeoPoint;
  siteAddress?: string;
  loadAddress?: string;
  unloadAddress?: string;
  visitAt?: string;
  /** 연결된 요청 id — 예약↔운반 세트 추적(선택). */
  linkedRequestId?: string;
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

// ── 현장 사진 AI 분석 (Phase 6): 소재 식별 + 철거 공정 안내
export const analyzeSite = (input: { imageBase64: string; mimeType?: string; note?: string }) =>
  api<SiteAnalysis>('/site-analysis/analyze', { method: 'POST', body: JSON.stringify(input) });

/** 사진 → 소재 식별 + (연면적 있으면) 총 중량 추정 → 요청서 소재별 항목(wasteItems) 자동 변환. */
export interface PhotoWasteItemsResult {
  analysis: SiteAnalysis;
  wasteItems: WasteItem[];
}
export const analyzeSiteWasteItems = (input: {
  imageBase64: string;
  mimeType?: string;
  floorAreaM2?: number;
}) =>
  api<PhotoWasteItemsResult>('/site-analysis/waste-items', {
    method: 'POST',
    body: JSON.stringify(input),
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
/**
 * 선결제 확정 — 앱 PortOne SDK 결제(paymentId)를 서버가 조회·검증한다.
 * 금액은 서버가 수락 견적에서 산출하고, 결제 실제 금액과 일치해야 통과(위변조 방지).
 * completedDate=처리완료 예정일(YYYY-MM-DD).
 */
export const prepay = (input: {
  matchRequestId: string;
  paymentId: string;
  completedDate: string;
  payMethod?: 'CARD' | 'VBANK';
}) => api<PrepayResult>('/payments/prepay', { method: 'POST', body: JSON.stringify(input) });

/** 취소/환불 — 결제자 본인만. stage 로 위약금 정책 결정. */
export const cancelPayment = (input: { paymentId: string; stage: CancellationStage; reason?: string }) =>
  api<{ breakdown: { refundAmount: number; penaltyAmount: number } }>('/payments/cancel', {
    method: 'POST',
    body: JSON.stringify(input),
  });

// ── 인테리어 밀봉 역경매 (파일럿 밖 · FEATURE_INTERIOR)
export interface CreateInteriorRequestInput {
  region: string;
  category: InteriorCategory;
  title: string;
  description: string;
  siteAddress: string;
  budget?: number;
  photoKeys?: string[];
}

/** 소비자가 인테리어 시공 요청 등록. requesterId 는 서버가 인증 세션에서 채운다. */
export const createInteriorRequest = (input: CreateInteriorRequestInput) =>
  api<InteriorRequest>('/interior/requests', { method: 'POST', body: JSON.stringify(input) });

/** scope=mine(내 요청) | open(대기중 공개 일감, 업체 입찰용). */
export const listInteriorRequests = (scope: 'mine' | 'open') =>
  api<InteriorRequest[]>(`/interior/requests?scope=${scope}`);

export const getInteriorRequest = (id: string) =>
  api<InteriorRequest>(`/interior/requests/${id}`);

/** 업체가 밀봉 입찰 제출(입찰자는 인증된 본인). */
export const submitInteriorBid = (requestId: string, amount: number, memo?: string) =>
  api<InteriorBid>(`/interior/requests/${requestId}/bids`, {
    method: 'POST',
    body: JSON.stringify(memo ? { amount, memo } : { amount }),
  });

/**
 * 요청의 입찰 목록(밀봉). 서버가 인증 viewer 기준으로 필터한다 —
 * 요청자면 전체, 업체면 자기 입찰만. 클라이언트는 받은 그대로 보여준다.
 */
export const listInteriorBids = (requestId: string) =>
  api<InteriorBid[]>(`/interior/requests/${requestId}/bids`);

/** 소비자(요청자 본인)가 입찰 낙찰 → 매칭 확정. */
export const acceptInteriorBid = (bidId: string) =>
  api<InteriorBid>(`/interior/bids/${bidId}/accept`, { method: 'POST', body: '{}' });

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

// ── 백오피스 확장 현황 (Phase 5)
/** 소재별 kg 입력 현황(전체 요청 wasteItems 집계). */
export interface AdminWasteMaterialRow {
  material: string;
  label: string;
  totalKg: number;
  itemCount: number;
}
export const adminWasteMaterials = (adminToken: string) =>
  api<AdminWasteMaterialRow[]>('/admin/waste-materials', {
    headers: { 'x-admin-token': adminToken },
  });

/** 밀봉 견적 현황 — 요청별 제출 건수(금액 비노출). */
export interface AdminQuoteSummaryRow {
  requestId: string;
  quoteCount: number;
}
export const adminQuotesSummary = (adminToken: string) =>
  api<AdminQuoteSummaryRow[]>('/admin/quotes-summary', {
    headers: { 'x-admin-token': adminToken },
  });

/** 업체 단가 설정 현황. */
export const adminListPricing = (adminToken: string) =>
  api<ProviderPricing[]>('/admin/pricing', {
    headers: { 'x-admin-token': adminToken },
  });
