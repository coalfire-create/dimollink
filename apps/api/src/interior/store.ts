import { randomUUID } from 'node:crypto';
import {
  canTransitionRequestStatus,
  visibleInteriorBids,
  type GeoPoint,
  type InteriorBid,
  type InteriorCategory,
  type InteriorRequest,
  type MatchStatus,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 인테리어 요청·밀봉 입찰 저장소 (파일럿 범위 밖 · FEATURE_INTERIOR 게이트).
 *
 * 철거 흐름의 요청 상태머신(REQUESTED→MATCHED→…)과 선결제/정산 파이프를 재사용하되,
 * "업체끼리 입찰가 비공개, 소비자만 전체 조회" 밀봉 규칙을 스토어 경계에서 강제한다.
 * 입찰 목록 반환은 반드시 listBids(viewer 지정)를 거치며, 저장 내부 맵을 직접 노출하지 않는다.
 */

export class InteriorValidationError extends Error {}

export interface CreateInteriorRequestInput {
  requesterId: string;
  region: string;
  category: InteriorCategory;
  title: string;
  description: string;
  siteAddress: string;
  location?: GeoPoint;
  budget?: number;
  photoKeys?: string[];
}

export interface SubmitBidInput {
  requestId: string;
  providerId: string;
  amount: number;
  memo?: string;
}

export class InteriorStore {
  private readonly requests = new Map<string, InteriorRequest>();
  private readonly bids = new Map<string, InteriorBid>();

  constructor(
    private readonly requestPersistence?: CollectionPersistence<InteriorRequest>,
    private readonly bidPersistence?: CollectionPersistence<InteriorBid>,
  ) {
    for (const r of requestPersistence?.load() ?? []) this.requests.set(r.id, r);
    for (const b of bidPersistence?.load() ?? []) this.bids.set(b.id, b);
  }

  createRequest(input: CreateInteriorRequestInput): InteriorRequest {
    if (!input.requesterId) throw new InteriorValidationError('requesterId 가 필요합니다.');
    if (!input.title?.trim()) throw new InteriorValidationError('제목을 입력하세요.');
    if (!input.siteAddress?.trim()) throw new InteriorValidationError('현장 주소를 입력하세요.');
    if (input.budget !== undefined && (!Number.isInteger(input.budget) || input.budget <= 0)) {
      throw new InteriorValidationError('희망 예산은 1원 이상의 정수(원)여야 합니다.');
    }

    const now = new Date().toISOString();
    const request: InteriorRequest = {
      id: randomUUID(),
      kind: 'INTERIOR',
      requesterId: input.requesterId,
      region: input.region,
      category: input.category,
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      siteAddress: input.siteAddress.trim(),
      ...(input.location ? { location: input.location } : {}),
      ...(input.budget !== undefined ? { budget: input.budget } : {}),
      photoKeys: input.photoKeys ?? [],
      status: 'REQUESTED',
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(request.id, request);
    this.saveRequests();
    return request;
  }

  getRequest(id: string): InteriorRequest | undefined {
    return this.requests.get(id);
  }

  /** 소비자 본인 요청 목록, 또는 (requesterId 미지정 시) 아직 대기중인 공개 요청 피드. */
  listRequests(filter: { requesterId?: string; status?: MatchStatus } = {}): InteriorRequest[] {
    return [...this.requests.values()]
      .filter(
        (r) =>
          (filter.requesterId === undefined || r.requesterId === filter.requesterId) &&
          (filter.status === undefined || r.status === filter.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * 인테리어 업체가 밀봉 입찰을 제출한다. 대기중(REQUESTED) 요청에만 가능하고,
   * 같은 업체가 다시 내면 히스토리로 누적된다(최신이 유효). 요청자 본인은 입찰 불가.
   */
  submitBid(input: SubmitBidInput): InteriorBid {
    const request = this.requests.get(input.requestId);
    if (!request) throw new InteriorValidationError('요청을 찾을 수 없습니다.');
    if (request.status !== 'REQUESTED') {
      throw new InteriorValidationError('매칭 대기중(REQUESTED) 요청에만 입찰할 수 있습니다.');
    }
    if (!input.providerId) throw new InteriorValidationError('providerId 가 필요합니다.');
    if (input.providerId === request.requesterId) {
      throw new InteriorValidationError('본인 요청에는 입찰할 수 없습니다.');
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new InteriorValidationError('입찰가는 1원 이상의 정수(원)여야 합니다.');
    }

    const bid: InteriorBid = {
      id: randomUUID(),
      requestId: input.requestId,
      providerId: input.providerId,
      amount: input.amount,
      ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
      status: 'SUBMITTED',
      createdAt: new Date().toISOString(),
    };
    this.bids.set(bid.id, bid);
    this.saveBids();
    return bid;
  }

  /**
   * 밀봉 규칙을 적용한 입찰 목록(최신순). viewerId 기준으로 볼 수 있는 것만 반환한다.
   * - 요청자(소비자): 전체 입찰
   * - 업체: 자기 입찰만
   * - 그 외: 빈 목록
   * 요청이 없으면 빈 목록(존재 여부 자체를 흘리지 않는다).
   */
  listBids(requestId: string, viewerId: string): InteriorBid[] {
    const request = this.requests.get(requestId);
    if (!request) return [];
    const all = [...this.bids.values()]
      .filter((b) => b.requestId === requestId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return visibleInteriorBids(all, viewerId, request.requesterId);
  }

  /**
   * 소비자(요청자 본인)가 입찰을 낙찰한다. 요청당 1건만 ACCEPTED, 나머지는 REJECTED.
   * 낙찰 시 요청을 MATCHED로 전이하고 낙찰가를 agreedFee(선결제 기준)로 기록한다.
   */
  acceptBid(bidId: string, accepterId: string): InteriorBid {
    const bid = this.bids.get(bidId);
    if (!bid) throw new InteriorValidationError('입찰을 찾을 수 없습니다.');
    const request = this.requests.get(bid.requestId);
    if (!request) throw new InteriorValidationError('요청을 찾을 수 없습니다.');
    if (request.requesterId !== accepterId) {
      throw new InteriorValidationError('본인 요청의 입찰만 낙찰할 수 있습니다.');
    }
    if (request.status !== 'REQUESTED') {
      throw new InteriorValidationError('이미 매칭이 확정된 요청입니다.');
    }

    for (const b of this.bids.values()) {
      if (b.requestId !== bid.requestId) continue;
      const status = b.id === bid.id ? 'ACCEPTED' : 'REJECTED';
      if (b.status !== status) this.bids.set(b.id, { ...b, status });
    }
    this.saveBids();

    this.changeRequestStatus(bid.requestId, 'MATCHED', {
      matchedProviderId: bid.providerId,
      matchedBidId: bid.id,
      agreedFee: bid.amount, // 낙찰가가 선결제 기준.
    });

    return this.bids.get(bidId)!;
  }

  /**
   * 요청 상태 전이 — 철거 요청과 동일한 전이 규칙(canTransitionRequestStatus)을 재사용한다.
   * 취소/환불 정책, 결제 후 IN_PROGRESS 진행 등 생명주기가 철거와 동일하다.
   */
  changeRequestStatus(
    requestId: string,
    to: MatchStatus,
    patch: Partial<
      Pick<InteriorRequest, 'matchedProviderId' | 'matchedBidId' | 'agreedFee' | 'paymentId' | 'cancelReason'>
    > = {},
  ): InteriorRequest {
    const request = this.requests.get(requestId);
    if (!request) throw new InteriorValidationError('요청을 찾을 수 없습니다.');
    if (!canTransitionRequestStatus(request.status, to)) {
      throw new InteriorValidationError(`${request.status} → ${to} 전이는 허용되지 않습니다.`);
    }
    const updated: InteriorRequest = {
      ...request,
      ...patch,
      status: to,
      updatedAt: new Date().toISOString(),
    };
    this.requests.set(requestId, updated);
    this.saveRequests();
    return updated;
  }

  private saveRequests(): void {
    this.requestPersistence?.save([...this.requests.values()]);
  }

  private saveBids(): void {
    this.bidPersistence?.save([...this.bids.values()]);
  }
}
