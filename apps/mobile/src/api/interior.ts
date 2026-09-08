import type {
  InteriorBid,
  InteriorCategory,
  InteriorRequest,
} from '@dimol/shared';
import { api } from './http';

/**
 * 인테리어 밀봉 역경매 API.
 *
 * 공통 인프라(베이스 URL·인증 헤더·오류 처리)는 [[http]] 에 있다.
 */

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

export const getInteriorRequest = (id: string) => api<InteriorRequest>(`/interior/requests/${id}`);

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
