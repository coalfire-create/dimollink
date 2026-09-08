import type {
  RatingSummary,
} from '@dimol/shared';
import { api } from './http';

/**
 * 리뷰 · 인시던트 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

// ── 리뷰 및 인시던트 API
export const createReview = (input: { requestId: string; rating: number; comment?: string }) =>
  api<{ id: string }>('/reviews', { method: 'POST', body: JSON.stringify(input) });

export const getRatingSummary = (userId: string) =>
  api<RatingSummary>(`/users/${userId}/rating`);

export const reportIncident = (input: { requestId: string; type: 'NO_SHOW' | 'DISPUTE'; detail?: string }) =>
  api<{ id: string }>('/incidents', { method: 'POST', body: JSON.stringify(input) });
