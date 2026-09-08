import type {
  BuildingLedgerInfo,
  GeoPoint,
  MatchStatus,
  ProviderPricing,
  ServiceRequest,
  UserApprovalStatus,
  UserProfile,
} from '@dimol/shared';
import { api } from './http';

/**
 * 관리자 백오피스 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 관리자 백오피스 (Phase 5)
/**
 * 관리자 인증 헤더.
 *
 * 빈 문자열이면 **로그인 세션(role=ADMIN)** 으로 들어간다 — api() 가 Bearer 토큰을
 * 자동으로 붙이므로 헤더를 더 얹을 필요가 없고, 그래야 누가 했는지가 서버에 남는다.
 * 값이 있으면 공유 운영 토큰(비상·부트스트랩) 경로다.
 */
export function adminHeaders(adminToken: string): Record<string, string> {
  return adminToken.trim() ? { 'x-admin-token': adminToken.trim() } : {};
}

export const adminListUsers = (adminToken: string, approvalStatus?: UserApprovalStatus) =>
  api<UserProfile[]>(`/admin/users${approvalStatus ? `?approvalStatus=${approvalStatus}` : ''}`, {
    headers: adminHeaders(adminToken),
  });

export const adminSetApproval = (adminToken: string, userId: string, status: UserApprovalStatus) =>
  api<UserProfile>(`/admin/users/${userId}/approval`, {
    method: 'PATCH',
    headers: adminHeaders(adminToken),
    body: JSON.stringify({ status }),
  });

/** 정산 모니터링 — 상태별 요청 목록. */
export const adminListRequests = (adminToken: string, status?: MatchStatus) =>
  api<ServiceRequest[]>(`/admin/requests${status ? `?status=${status}` : ''}`, {
    headers: adminHeaders(adminToken),
  });

/** 정산(지급대행) 실행 — 관리자 토큰. 금액·사업자번호는 서버 확정값. */
export const adminExecutePayout = (
  adminToken: string,
  matchRequestId: string,
  completedDate: string,
) =>
  api<{ settlementDate: string; payouts: unknown[]; taxInvoices: unknown[] }>('/payments/payouts', {
    method: 'POST',
    headers: adminHeaders(adminToken),
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
    headers: adminHeaders(adminToken),
  });

/** 밀봉 견적 현황 — 요청별 제출 건수(금액 비노출). */
export interface AdminQuoteSummaryRow {
  requestId: string;
  quoteCount: number;
}
export const adminQuotesSummary = (adminToken: string) =>
  api<AdminQuoteSummaryRow[]>('/admin/quotes-summary', {
    headers: adminHeaders(adminToken),
  });

/** 업체 단가 설정 현황. */
export const adminListPricing = (adminToken: string) =>
  api<ProviderPricing[]>('/admin/pricing', {
    headers: adminHeaders(adminToken),
  });

/** 주소 및 건물명 검색 API. */
export interface AddressSearchResult {
  addressName: string;
  roadAddressName: string;
  buildingName?: string;
  region: string;
  location?: GeoPoint;
  /**
   * 실제 주소를 확정하지 못한 근사 결과(역지오코딩 키 없음·API 실패 등).
   * 좌표는 정확하므로 지도 표시는 그대로 하되, 주소로 취급해 저장하면 안 된다.
   */
  approximate?: boolean;
}

export const searchAddress = (query: string) =>
  api<AddressSearchResult[]>(`/locations/search-address?query=${encodeURIComponent(query)}`);

export const coord2Address = (lat: number, lng: number) =>
  api<AddressSearchResult>(`/locations/coord2address?lat=${lat}&lng=${lng}`);

/** 건축물대장 표제부(공공데이터). 필드 정의는 @dimol/shared 단일 출처를 쓴다. */
export type BuildingInfo = BuildingLedgerInfo;

export const getBuildingInfo = (address: string) =>
  api<BuildingInfo>(`/locations/building-info?address=${encodeURIComponent(address)}`);

// ── 백오피스 상황 제어 (Phase 5)
/**
 * 멈춘 요청에 개입해 상태를 옮긴다. 정상 전이 규칙을 건너뛰므로 **사유가 필수**다.
 * 업체 잠수·연락두절처럼 참여자 누구도 풀 수 없는 상태를 정리하는 용도.
 */
export const adminForceStatus = (
  adminToken: string,
  requestId: string,
  status: MatchStatus,
  reason: string,
) =>
  // refundRequired: 결제된 건을 취소했다는 뜻. 환불은 따라 일어나지 않으므로 화면이 알린다.
  api<ServiceRequest & { refundRequired?: boolean }>(`/admin/requests/${requestId}/status`, {
    method: 'PATCH',
    headers: adminHeaders(adminToken),
    body: JSON.stringify({ status, reason }),
  });

/** 계정 권한 부여/회수. 첫 관리자는 공유 운영 토큰으로 지정한다. */
export const adminSetRole = (adminToken: string, userId: string, role: 'ADMIN' | 'MEMBER') =>
  api<UserProfile>(`/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: adminHeaders(adminToken),
    body: JSON.stringify({ role }),
  });

/** 노쇼·분쟁 조정 큐. */
export interface AdminIncident {
  id: string;
  requestId: string;
  targetId: string;
  reporterId: string;
  kind: string;
  status: 'OPEN' | 'RESOLVED';
  note?: string;
  resolutionNote?: string;
  createdAt: string;
}
export const adminListIncidents = (adminToken: string, status?: 'OPEN' | 'RESOLVED') =>
  api<AdminIncident[]>(`/admin/incidents${status ? `?status=${status}` : ''}`, {
    headers: adminHeaders(adminToken),
  });

export const adminResolveIncident = (
  adminToken: string,
  incidentId: string,
  resolutionNote: string,
) =>
  api<AdminIncident>(`/admin/incidents/${incidentId}/resolve`, {
    method: 'POST',
    headers: adminHeaders(adminToken),
    body: JSON.stringify({ resolutionNote }),
  });

/** 이상거래 탐지 결과(룰 기반). 조치는 사람이 판단한다. */
export interface AdminAnomaly {
  kind: string;
  message: string;
  requestId?: string;
  userId?: string;
}
export const adminListAnomalies = (adminToken: string) =>
  api<AdminAnomaly[]>('/admin/anomalies', { headers: adminHeaders(adminToken) });

/** 올바로 재시도 큐 — PII 제외 요약. */
export interface AdminRetryItem {
  id: string;
  matchRequestId: string;
  attempts: number;
  maxAttempts: number;
  status: 'PENDING' | 'SUCCEEDED' | 'EXHAUSTED';
  nextAttemptAt: string;
  manifestNo?: string;
  lastError?: string;
}
export const adminAllbaroQueue = (adminToken: string) =>
  api<AdminRetryItem[]>('/allbaro/manifest/queue', { headers: adminHeaders(adminToken) });

export const adminAllbaroFailures = (adminToken: string) =>
  api<AdminRetryItem[]>('/allbaro/manifest/failures', { headers: adminHeaders(adminToken) });

/** 큐 전체를 지금 한 번 처리한다(스케줄러를 기다리지 않고). */
export const adminAllbaroRetryNow = (adminToken: string) =>
  api<{ processed: number; succeeded: number; requeued: number; exhausted: number }>(
    '/allbaro/manifest/retry',
    { method: 'POST', headers: adminHeaders(adminToken), body: '{}' },
  );

/** 소진된 건 하나를 재적재하고 즉시 1회 시도. */
export const adminAllbaroRetryOne = (adminToken: string, itemId: string) =>
  api<{ summary: unknown; item?: AdminRetryItem }>(
    `/allbaro/manifest/failures/${itemId}/retry`,
    { method: 'POST', headers: adminHeaders(adminToken), body: '{}' },
  );
