import type { DemolitionEstimate, ProviderEstimateAccuracy } from '@dimol/shared';
import { api } from './http';

/**
 * 철거 견적 API — 개산(범위) → 실사 예약 → 확정.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 * 운반·처리의 단발 견적(`quotes`)과 다른 흐름인 이유는 shared 의 demolition-estimate 참고.
 */

/** 1단계 — 업체가 사진·대장을 보고 개산 범위를 낸다. 구속력 없음. */
export const submitPreliminaryEstimate = (input: {
  requestId: string;
  minAmount: number;
  maxAmount: number;
  memo?: string;
}) =>
  api<DemolitionEstimate>('/demolition-estimates', {
    method: 'POST',
    body: JSON.stringify(input),
  });

/** 요청의 견적 목록. 밀봉 규칙은 서버가 적용한다(업체는 자기 것만 받는다). */
export const listDemolitionEstimates = (requestId: string) =>
  api<DemolitionEstimate[]>(
    `/demolition-estimates?requestId=${encodeURIComponent(requestId)}`,
  );

/** 2단계 — 소비자가 실사를 예약한다(요청당 최대 3곳). */
export const scheduleSiteVisit = (estimateId: string, scheduledAt: string) =>
  api<DemolitionEstimate>(`/demolition-estimates/${estimateId}/visit`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  });

/** 실사 예약 취소 — 자리를 비워야 다른 업체를 부를 수 있다. */
export const cancelSiteVisit = (estimateId: string) =>
  api<DemolitionEstimate>(`/demolition-estimates/${estimateId}/visit`, { method: 'DELETE' });

/**
 * 3단계 — 실사를 마친 업체가 확정 금액을 낸다. 개산 상단 초과 시 사유 필수.
 * `remote` 면 원격 실사 자료 기준 확정 — 서버가 실사 기록을 원격(REMOTE)으로 맞춘다.
 */
export const submitFinalEstimate = (input: {
  estimateId: string;
  amount: number;
  overrunReason?: string;
  memo?: string;
  remote?: boolean;
}) =>
  api<DemolitionEstimate>(`/demolition-estimates/${input.estimateId}/final`, {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amount,
      overrunReason: input.overrunReason,
      memo: input.memo,
      ...(input.remote ? { remote: true } : {}),
    }),
  });

/** 업체: 원격 실사로 진행 — 소비자가 보낸 원격 실사 자료로 실사를 마친다고 기록한다. */
export const markRemoteSiteVisit = (estimateId: string) =>
  api<DemolitionEstimate>(`/demolition-estimates/${estimateId}/remote-visit`, {
    method: 'POST',
    body: '{}',
  });

/** 소비자가 확정 견적을 수락 → 매칭 확정. 계약금액이 이 금액으로 잡힌다. */
export const acceptDemolitionEstimate = (estimateId: string) =>
  api<DemolitionEstimate>(`/demolition-estimates/${estimateId}/accept`, {
    method: 'POST',
    body: '{}',
  });

/** 업체별 개산 정확도 — 프로필·견적 비교 화면에 노출한다. */
export const getEstimateAccuracy = (providerId: string) =>
  api<ProviderEstimateAccuracy>(`/providers/${encodeURIComponent(providerId)}/estimate-accuracy`);
