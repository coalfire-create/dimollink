import { randomUUID } from 'node:crypto';
import { MATCH_OFFER_TTL_MINUTES, type MatchOffer, type MatchOfferStatus } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

export class OfferValidationError extends Error {}

export interface CreateOfferInput {
  requestId: string;
  providerId: string;
  ttlMinutes?: number;
}

export class OfferStore {
  private readonly fallbackMap = new Map<string, MatchOffer>();

  constructor(
    private readonly requestStore: RequestStore,
    private readonly persistence?: CollectionPersistence<MatchOffer>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async getInner(id: string): Promise<MatchOffer | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }

  private async listInner(): Promise<MatchOffer[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMap.values()];
  }

  private async saveInner(offer: MatchOffer): Promise<void> {
    if (this.persistence) {
      await this.persistence.save(offer);
    } else {
      this.fallbackMap.set(offer.id, offer);
    }
  }

  private async saveAllInner(offers: MatchOffer[]): Promise<void> {
    if (this.persistence) {
      await this.persistence.saveAll(offers);
    } else {
      for (const o of offers) this.fallbackMap.set(o.id, o);
    }
  }

  async sweepExpired(): Promise<MatchOffer[]> {
    const nowIso = this.now().toISOString();
    const expired: MatchOffer[] = [];
    const all = await this.listInner();
    for (const offer of all) {
      if (offer.status === 'OFFERED' && offer.expiresAt <= nowIso) {
        expired.push({ ...offer, status: 'EXPIRED' });
      }
    }
    if (expired.length > 0) {
      await this.saveAllInner(expired);
    }
    return expired;
  }

  async createOffer(input: CreateOfferInput): Promise<MatchOffer> {
    await this.sweepExpired();

    const request = await this.requestStore.get(input.requestId);
    if (!request) throw new OfferValidationError('요청을 찾을 수 없습니다.');
    if (request.status !== 'REQUESTED') {
      throw new OfferValidationError('매칭 대기중(REQUESTED) 요청에만 제안할 수 있습니다.');
    }
    if (!input.providerId) throw new OfferValidationError('providerId 가 필요합니다.');

    const allOffers = await this.listInner();
    const existing = allOffers.filter((o) => o.requestId === input.requestId);
    
    if (existing.some((o) => o.status === 'OFFERED')) {
      throw new OfferValidationError('이미 응답 대기중인 제안이 있습니다.');
    }
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
    await this.saveInner(offer);
    return offer;
  }

  async respond(offerId: string, action: 'ACCEPT' | 'DECLINE'): Promise<MatchOffer> {
    await this.sweepExpired();

    const offer = await this.getInner(offerId);
    if (!offer) throw new OfferValidationError('제안을 찾을 수 없습니다.');
    if (offer.status === 'EXPIRED') {
      throw new OfferValidationError('응답 시간이 지난 제안입니다. 재매칭을 진행하세요.');
    }
    if (offer.status !== 'OFFERED') {
      throw new OfferValidationError('이미 응답한 제안입니다.');
    }

    if (action === 'ACCEPT') {
      await this.requestStore.changeStatus(offer.requestId, 'MATCHED', {
        matchedProviderId: offer.providerId,
      });
    }
    const updated: MatchOffer = {
      ...offer,
      status: action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
      respondedAt: this.now().toISOString(),
    };
    await this.saveInner(updated);
    return updated;
  }

  async get(offerId: string): Promise<MatchOffer | undefined> {
    await this.sweepExpired();
    return this.getInner(offerId);
  }

  async list(filter: { requestId?: string; providerId?: string; status?: MatchOfferStatus } = {}): Promise<MatchOffer[]> {
    await this.sweepExpired();
    const all = await this.listInner();
    return all
      .filter(
        (o) =>
          (filter.requestId === undefined || o.requestId === filter.requestId) &&
          (filter.providerId === undefined || o.providerId === filter.providerId) &&
          (filter.status === undefined || o.status === filter.status),
      )
      .sort((a, b) => b.offeredAt.localeCompare(a.offeredAt));
  }
}
