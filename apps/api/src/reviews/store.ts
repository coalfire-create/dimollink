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

function counterpartyOf(request: ServiceRequest, partyId: string): string {
  if (request.matchedProviderId === undefined) {
    throw new ReviewValidationError('매칭 업체가 확정되지 않은 요청입니다.');
  }
  if (partyId === request.requesterId) return request.matchedProviderId;
  if (partyId === request.matchedProviderId) return request.requesterId;
  throw new ReviewValidationError('요청 당사자만 평가/신고할 수 있습니다.');
}

export class ReviewStore {
  private readonly fallbackReviews = new Map<string, Review>();
  private readonly fallbackIncidents = new Map<string, Incident>();

  constructor(
    private readonly requestStore: RequestStore,
    private readonly reviewPersistence?: CollectionPersistence<Review>,
    private readonly incidentPersistence?: CollectionPersistence<Incident>,
  ) {}

  private async getReviewsInner(): Promise<Review[]> {
    if (this.reviewPersistence) return this.reviewPersistence.list();
    return [...this.fallbackReviews.values()];
  }

  private async saveReviewInner(review: Review): Promise<void> {
    if (this.reviewPersistence) await this.reviewPersistence.save(review);
    else this.fallbackReviews.set(review.id, review);
  }

  private async getIncidentsInner(): Promise<Incident[]> {
    if (this.incidentPersistence) return this.incidentPersistence.list();
    return [...this.fallbackIncidents.values()];
  }

  private async saveIncidentInner(incident: Incident): Promise<void> {
    if (this.incidentPersistence) await this.incidentPersistence.save(incident);
    else this.fallbackIncidents.set(incident.id, incident);
  }
  
  private async getIncidentInner(id: string): Promise<Incident | undefined> {
    if (this.incidentPersistence) return this.incidentPersistence.get(id);
    return this.fallbackIncidents.get(id);
  }

  async createReview(input: CreateReviewInput): Promise<Review> {
    const request = await this.requestStore.get(input.requestId);
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
    
    const allReviews = await this.getReviewsInner();
    const duplicate = allReviews.some(
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
    await this.saveReviewInner(review);
    return review;
  }

  async listReviews(filter: { ratedId?: string; requestId?: string } = {}): Promise<Review[]> {
    const allReviews = await this.getReviewsInner();
    return allReviews
      .filter(
        (r) =>
          (filter.ratedId === undefined || r.ratedId === filter.ratedId) &&
          (filter.requestId === undefined || r.requestId === filter.requestId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async ratingSummary(userId: string): Promise<RatingSummary> {
    const reviews = await this.listReviews({ ratedId: userId });
    const allIncidents = await this.getIncidentsInner();
    const incidents = allIncidents.filter((i) => i.targetId === userId);
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

  async reportIncident(input: ReportIncidentInput): Promise<Incident> {
    const request = await this.requestStore.get(input.requestId);
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
    await this.saveIncidentInner(incident);
    return incident;
  }

  async listIncidents(filter: { targetId?: string; status?: Incident['status'] } = {}): Promise<Incident[]> {
    const allIncidents = await this.getIncidentsInner();
    return allIncidents
      .filter(
        (i) =>
          (filter.targetId === undefined || i.targetId === filter.targetId) &&
          (filter.status === undefined || i.status === filter.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveIncident(id: string, resolutionNote?: string): Promise<Incident> {
    const incident = await this.getIncidentInner(id);
    if (!incident) throw new ReviewValidationError('인시던트를 찾을 수 없습니다.');
    const resolved: Incident = {
      ...incident,
      status: 'RESOLVED',
      ...(resolutionNote?.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
      resolvedAt: new Date().toISOString(),
    };
    await this.saveIncidentInner(resolved);
    return resolved;
  }
}
