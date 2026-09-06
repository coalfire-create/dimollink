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
  private readonly fallbackRequests = new Map<string, InteriorRequest>();
  private readonly fallbackBids = new Map<string, InteriorBid>();

  constructor(
    private readonly requestPersistence?: CollectionPersistence<InteriorRequest>,
    private readonly bidPersistence?: CollectionPersistence<InteriorBid>,
  ) {}

  private async getRequestInner(id: string): Promise<InteriorRequest | undefined> {
    if (this.requestPersistence) return this.requestPersistence.get(id);
    return this.fallbackRequests.get(id);
  }

  private async listRequestsInner(): Promise<InteriorRequest[]> {
    if (this.requestPersistence) return this.requestPersistence.list();
    return [...this.fallbackRequests.values()];
  }

  private async saveRequestInner(request: InteriorRequest): Promise<void> {
    if (this.requestPersistence) await this.requestPersistence.save(request);
    else this.fallbackRequests.set(request.id, request);
  }

  private async getBidInner(id: string): Promise<InteriorBid | undefined> {
    if (this.bidPersistence) return this.bidPersistence.get(id);
    return this.fallbackBids.get(id);
  }

  private async listBidsInner(): Promise<InteriorBid[]> {
    if (this.bidPersistence) return this.bidPersistence.list();
    return [...this.fallbackBids.values()];
  }

  private async saveBidInner(bid: InteriorBid): Promise<void> {
    if (this.bidPersistence) await this.bidPersistence.save(bid);
    else this.fallbackBids.set(bid.id, bid);
  }

  async createRequest(input: CreateInteriorRequestInput): Promise<InteriorRequest> {
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
    await this.saveRequestInner(request);
    return request;
  }

  async getRequest(id: string): Promise<InteriorRequest | undefined> {
    return this.getRequestInner(id);
  }

  async listRequests(filter: { requesterId?: string; status?: MatchStatus } = {}): Promise<InteriorRequest[]> {
    const all = await this.listRequestsInner();
    return all
      .filter(
        (r) =>
          (filter.requesterId === undefined || r.requesterId === filter.requesterId) &&
          (filter.status === undefined || r.status === filter.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async submitBid(input: SubmitBidInput): Promise<InteriorBid> {
    const request = await this.getRequestInner(input.requestId);
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
    await this.saveBidInner(bid);
    return bid;
  }

  async listBids(requestId: string, viewerId: string): Promise<InteriorBid[]> {
    const request = await this.getRequestInner(requestId);
    if (!request) return [];
    const all = await this.listBidsInner();
    const requestBids = all
      .filter((b) => b.requestId === requestId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return visibleInteriorBids(requestBids, viewerId, request.requesterId);
  }

  async acceptBid(bidId: string, accepterId: string): Promise<InteriorBid> {
    const bid = await this.getBidInner(bidId);
    if (!bid) throw new InteriorValidationError('입찰을 찾을 수 없습니다.');
    const request = await this.getRequestInner(bid.requestId);
    if (!request) throw new InteriorValidationError('요청을 찾을 수 없습니다.');
    if (request.requesterId !== accepterId) {
      throw new InteriorValidationError('본인 요청의 입찰만 낙찰할 수 있습니다.');
    }
    if (request.status !== 'REQUESTED') {
      throw new InteriorValidationError('이미 매칭이 확정된 요청입니다.');
    }

    const allBids = await this.listBidsInner();
    for (const b of allBids) {
      if (b.requestId !== bid.requestId) continue;
      const status = b.id === bid.id ? 'ACCEPTED' : 'REJECTED';
      if (b.status !== status) {
        await this.saveBidInner({ ...b, status });
      }
    }

    await this.changeRequestStatus(bid.requestId, 'MATCHED', {
      matchedProviderId: bid.providerId,
      matchedBidId: bid.id,
      agreedFee: bid.amount,
    });

    return (await this.getBidInner(bidId))!;
  }

  async changeRequestStatus(
    requestId: string,
    to: MatchStatus,
    patch: Partial<
      Pick<InteriorRequest, 'matchedProviderId' | 'matchedBidId' | 'agreedFee' | 'paymentId' | 'cancelReason'>
    > = {},
  ): Promise<InteriorRequest> {
    const request = await this.getRequestInner(requestId);
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
    await this.saveRequestInner(updated);
    return updated;
  }
}
