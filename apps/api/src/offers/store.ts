import { randomUUID } from 'node:crypto';
import { MATCH_OFFER_TTL_MINUTES, type MatchOffer, type MatchOfferStatus } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

/**
 * 자동매칭 오퍼 저장소 (로드맵 Phase 3 · 타임아웃/재매칭).
 *
 * - 요청당 활성(OFFERED) 오퍼는 1건만 — 순차 제안 모델.
 * - 만료는 서버 타이머 없이 접근 시점의 지연 스윕(sweepExpired)으로 판정한다.
 * - 수락 시 요청을 MATCHED 로 전이시키고, 거절/만료된 요청은 REQUESTED 로 남아
 *   다음 후보에게 재제안할 수 있다.
 */

export class OfferValidationError extends Error {}

export interface CreateOfferInput {
  requestId: string;
  providerId: string;
  /** 응답 제한(분). 기본 MATCH_OFFER_TTL_MINUTES. */
  ttlMinutes?: number;
}

export class OfferStore {
  private readonly offers = new Map<string, MatchOffer>();

  constructor(
    private readonly requestStore: RequestStore,
    private readonly persistence?: CollectionPersistence<MatchOffer>,
    /** 테스트용 시계 주입. */
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const offer of persistence?.load() ?? []) this.offers.set(offer.id, offer);
  }

  /** 만료 시각이 지난 OFFERED 오퍼를 EXPIRED 로 전환하고, 이번에 만료된 건을 돌려준다. */
  sweepExpired(): MatchOffer[] {
    const nowIso = this.now().toISOString();
    const expired: MatchOffer[] = [];
    for (const offer of this.offers.values()) {
      if (offer.status === 'OFFERED' && offer.expiresAt <= nowIso) {
        const updated: MatchOffer = { ...offer, status: 'EXPIRED' };
        this.offers.set(offer.id, updated);
        expired.push(updated);
      }
    }
    if (expired.length > 0) this.persistence?.save([...this.offers.values()]);
    return expired;
  }

  createOffer(input: CreateOfferInput): MatchOffer {
    this.sweepExpired();

    const request = this.requestStore.get(input.requestId);
    if (!request) throw new OfferValidationError('요청을 찾을 수 없습니다.');
    if (request.status !== 'REQUESTED') {
      throw new OfferValidationError('매칭 대기중(REQUESTED) 요청에만 제안할 수 있습니다.');
    }
    if (!input.providerId) throw new OfferValidationError('providerId 가 필요합니다.');

    const existing = [...this.offers.values()].filter((o) => o.requestId === input.requestId);
    if (existing.some((o) => o.status === 'OFFERED')) {
      throw new OfferValidationError('이미 응답 대기중인 제안이 있습니다.');
    }
    // 거절/만료된 업체에는 같은 요청을 다시 제안하지 않는다 (다음 후보로 재매칭).
    if (existing.some((o) => o.providerId === input.providerId)) {
      throw new OfferValidationError('이미 이 업체에 제안했던 요청입니다. 다음 후보에게 제안하세요.');
    }

    const ttlMinutes = input.ttlMinutes ?? MATCH_OFFER_TTL_MINUTES;
    if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
      throw new OfferValidationError('ttlMinutes 는 0보다 커야 합니다.');
    }

    const offeredAt = this.now();
    const offer: MatchOffer = {
      id: randomUUID(),
      requestId: input.requestId,
      providerId: input.providerId,
      status: 'OFFERED',
      offeredAt: offeredAt.toISOString(),
      expiresAt: new Date(offeredAt.getTime() + ttlMinutes * 60_000).toISOString(),
    };
    this.offers.set(offer.id, offer);
    this.persistence?.save([...this.offers.values()]);
    return offer;
  }

  /** 업체 응답. 수락이면 요청을 MATCHED 로 전이한다. */
  respond(offerId: string, action: 'ACCEPT' | 'DECLINE'): MatchOffer {
    this.sweepExpired();

    const offer = this.offers.get(offerId);
    if (!offer) throw new OfferValidationError('제안을 찾을 수 없습니다.');
    if (offer.status === 'EXPIRED') {
      throw new OfferValidationError('응답 시간이 지난 제안입니다. 재매칭을 진행하세요.');
    }
    if (offer.status !== 'OFFERED') {
      throw new OfferValidationError('이미 응답한 제안입니다.');
    }

    if (action === 'ACCEPT') {
      // 요청 전이가 실패하면(REQUESTED 아님 등) 오퍼도 수락 처리하지 않는다.
      this.requestStore.changeStatus(offer.requestId, 'MATCHED', {
        matchedProviderId: offer.providerId,
      });
    }
    const updated: MatchOffer = {
      ...offer,
      status: action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
      respondedAt: this.now().toISOString(),
    };
    this.offers.set(offerId, updated);
    this.persistence?.save([...this.offers.values()]);
    return updated;
  }

  get(offerId: string): MatchOffer | undefined {
    this.sweepExpired();
    return this.offers.get(offerId);
  }

  list(
    filter: { requestId?: string; providerId?: string; status?: MatchOfferStatus } = {},
  ): MatchOffer[] {
    this.sweepExpired();
    return [...this.offers.values()]
      .filter(
        (o) =>
          (filter.requestId === undefined || o.requestId === filter.requestId) &&
          (filter.providerId === undefined || o.providerId === filter.providerId) &&
          (filter.status === undefined || o.status === filter.status),
      )
      .sort((a, b) => b.offeredAt.localeCompare(a.offeredAt));
  }
}
