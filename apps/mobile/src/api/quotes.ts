import type {
  ProviderRole,
  Quote,
} from '@dimol/shared';
import { api } from './http';

/**
 * 견적 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 견적 (처리장 견적 비교 등 · Phase 3)
/** 업체가 요청에 견적 제출(제출자는 인증된 본인). party: TRANSPORT | DISPOSAL. */
export const submitQuote = (input: {
  requestId: string;
  party: ProviderRole;
  amount: number;
  memo?: string;
}) => api<Quote>('/quotes', { method: 'POST', body: JSON.stringify(input) });

/** 요청의 견적 목록(가격 비교용). */
export const listQuotes = (requestId: string) =>
  api<Quote[]>(`/quotes?requestId=${encodeURIComponent(requestId)}`);

/** 배출자(요청자 본인)가 견적 수락 → 정산 금액 확정. */
export const acceptQuote = (quoteId: string) =>
  api<Quote>(`/quotes/${quoteId}/accept`, { method: 'POST', body: '{}' });
