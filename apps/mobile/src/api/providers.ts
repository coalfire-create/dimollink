import type {
  ProviderJobs,
  ProviderPricing,
  ServiceRequest,
} from '@dimol/shared';
import { api } from './http';

/**
 * 업체 단가 · 업체 일감 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

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
