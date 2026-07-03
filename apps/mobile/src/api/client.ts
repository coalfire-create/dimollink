import { Platform } from 'react-native';
import type {
  AppNotification,
  ChatMessage,
  MarketRate,
  ProviderRole,
  RatingSummary,
  RequestKind,
  ServiceRequest,
  UserProfile,
  UserRole,
  VolumeEstimate,
} from '@dimol/shared';

/**
 * 백엔드 API 클라이언트.
 * - 오류 응답의 `error`(한글 문구)는 그대로 사용자에게 노출 가능하다 — ApiError.message 로 전달.
 * - Android 에뮬레이터는 호스트 루프백이 10.0.2.2 이므로 플랫폼별로 베이스 URL을 나눈다.
 */
const HOST = Platform.select({ android: '10.0.2.2', default: 'localhost' });
export const API_BASE_URL = `http://${HOST}:4000/api`;

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

// ── 회원 (Phase 1)
export interface CreateUserInput {
  role: UserRole;
  name: string;
  region: string;
  phone?: string;
  businessNumber?: string;
}

export const createUser = (input: CreateUserInput) =>
  api<UserProfile>('/users', { method: 'POST', body: JSON.stringify(input) });

export const getUser = (id: string) => api<UserProfile>(`/users/${id}`);

export const getRating = (userId: string) => api<RatingSummary>(`/users/${userId}/rating`);

// ── 서비스 요청 (Phase 1)
export interface CreateRequestInput {
  kind: RequestKind;
  requesterId: string;
  region: string;
  wasteCategory: string;
  wasteTons: number;
  allbaroRequested: boolean;
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
