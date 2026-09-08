import type {
  DemolitionDetails,
  GeoPoint,
  MarketRate,
  MatchStatus,
  ProviderRole,
  RequestKind,
  ServiceRequest,
  WasteItem,
} from '@dimol/shared';
import { api } from './http';

/**
 * 서비스 요청 · 시세 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 서비스 요청 (Phase 1)
export interface CreateRequestInput {
  kind: RequestKind;
  requesterId: string;
  region: string;
  wasteCategory: string;
  /** 소재별 항목(종류+kg). 운반/처리장 필수, 철거요청 선택. */
  wasteItems?: WasteItem[];
  /** 레거시(하위호환) — wasteItems 미지정 시에만 사용. */
  wasteTons?: number;
  allbaroRequested: boolean;
  /** 현장 좌표(거리 기반 매칭용, 선택). */
  location?: GeoPoint;
  siteAddress?: string;
  demolitionDetails?: DemolitionDetails;
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
