import { randomUUID } from 'node:crypto';
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
  type Incident,
  type IncidentType,
  type RatingSummary,
  type Review,
  type ServiceRequest,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

/**
 * 리뷰·평점 + 노쇼/분쟁 이력 저장소 (로드맵 Phase 2 · 신뢰 구축).
 * 리뷰는 완료된 요청의 당사자(배출자↔매칭 업체) 사이에서만, 요청당 평가자별 1회.
 */

export class ReviewValidationError extends Error {}

export interface CreateReviewInput {
  requestId: string;
  raterId: string;
  rating: number;
  comment?: string;
}

export interface ReportIncidentInput {
  requestId: string;
  reporterId: string;
  type: IncidentType;
  detail?: string;
}

/** 요청 당사자 검증: 평가자/신고자가 당사자면 상대 당사자 id 를 돌려준다. */
function counterpartyOf(request: ServiceRequest, partyId: string): string {
  if (request.matchedProviderId === undefined) {
    throw new ReviewValidationError('매칭 업체가 확정되지 않은 요청입니다.');
  }
  if (partyId === request.requesterId) return request.matchedProviderId;
  if (partyId === request.matchedProviderId) return request.requesterId;
  throw new ReviewValidationError('요청 당사자만 평가/신고할 수 있습니다.');
}

export class ReviewStore {
  private readonly reviews = new Map<string, Review>();
  private readonly incidents = new Map<string, Incident>();

  constructor(
    private readonly requestStore: RequestStore,
    private readonly reviewPersistence?: CollectionPersistence<Review>,
    private readonly incidentPersistence?: CollectionPersistence<Incident>,
  ) {
    for (const review of reviewPersistence?.load() ?? []) this.reviews.set(review.id, review);
    for (const incident of incidentPersistence?.load() ?? []) {
      this.incidents.set(incident.id, incident);
    }
  }

  createReview(input: CreateReviewInput): Review {
    const request = this.requestStore.get(input.requestId);
    if (!request) throw new ReviewValidationError('요청을 찾을 수 없습니다.');
    if (request.status !== 'COMPLETED' && request.status !== 'SETTLED') {
      throw new ReviewValidationError('처리 완료된 요청만 평가할 수 있습니다.');
    }
    const ratedId = counterpartyOf(request, input.raterId);
    if (!Number.isInteger(input.rating) || input.rating < REVIEW_RATING_MIN || input.rating > REVIEW_RATING_MAX) {
      throw new ReviewValidationError(
        `rating 은 ${REVIEW_RATING_MIN}~${REVIEW_RATING_MAX} 정수여야 합니다.`,
      );
    }
    const duplicate = [...this.reviews.values()].some(
      (r) => r.requestId === input.requestId && r.raterId === input.raterId,
    );
    if (duplicate) throw new ReviewValidationError('이미 이 요청을 평가했습니다.');

    const review: Review = {
      id: randomUUID(),
      requestId: input.requestId,
      raterId: input.raterId,
      ratedId,
      rating: input.rating,
      ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
      createdAt: new Date().toISOString(),
    };
    this.reviews.set(review.id, review);
    this.reviewPersistence?.save([...this.reviews.values()]);
    return review;
  }

  listReviews(filter: { ratedId?: string; requestId?: string } = {}): Review[] {
    return [...this.reviews.values()]
      .filter(
        (r) =>
          (filter.ratedId === undefined || r.ratedId === filter.ratedId) &&
          (filter.requestId === undefined || r.requestId === filter.requestId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 평점 요약 — 프로필 표시·매칭 추천 정렬(Phase 3)에서 사용. */
  ratingSummary(userId: string): RatingSummary {
    const reviews = this.listReviews({ ratedId: userId });
    const incidents = [...this.incidents.values()].filter((i) => i.targetId === userId);
    const average =
      reviews.length === 0
        ? null
        : Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 100) / 100;
    return {
      userId,
      average,
      reviewCount: reviews.length,
      noShowCount: incidents.filter((i) => i.type === 'NO_SHOW').length,
      disputeCount: incidents.filter((i) => i.type === 'DISPUTE').length,
    };
  }

  reportIncident(input: ReportIncidentInput): Incident {
    const request = this.requestStore.get(input.requestId);
    if (!request) throw new ReviewValidationError('요청을 찾을 수 없습니다.');
    if (input.type !== 'NO_SHOW' && input.type !== 'DISPUTE') {
      throw new ReviewValidationError('type 은 NO_SHOW | DISPUTE 여야 합니다.');
    }
    const targetId = counterpartyOf(request, input.reporterId);
    const incident: Incident = {
      id: randomUUID(),
      requestId: input.requestId,
      reporterId: input.reporterId,
      targetId,
      type: input.type,
      ...(input.detail?.trim() ? { detail: input.detail.trim() } : {}),
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    this.incidents.set(incident.id, incident);
    this.incidentPersistence?.save([...this.incidents.values()]);
    return incident;
  }

  listIncidents(filter: { targetId?: string; status?: Incident['status'] } = {}): Incident[] {
    return [...this.incidents.values()]
      .filter(
        (i) =>
          (filter.targetId === undefined || i.targetId === filter.targetId) &&
          (filter.status === undefined || i.status === filter.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 분쟁 조정 완료 처리 (Phase 5 백오피스에서 호출). */
  resolveIncident(id: string, resolutionNote?: string): Incident {
    const incident = this.incidents.get(id);
    if (!incident) throw new ReviewValidationError('인시던트를 찾을 수 없습니다.');
    const resolved: Incident = {
      ...incident,
      status: 'RESOLVED',
      ...(resolutionNote?.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
      resolvedAt: new Date().toISOString(),
    };
    this.incidents.set(id, resolved);
    this.incidentPersistence?.save([...this.incidents.values()]);
    return resolved;
  }
}
