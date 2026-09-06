import { randomUUID } from 'node:crypto';
import type { MarketRate, ProviderRole, Quote } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

export class QuoteValidationError extends Error {}

export interface CreateQuoteInput {
  requestId: string;
  providerId: string;
  party: ProviderRole;
  amount: number;
  memo?: string;
}

export class QuoteStore {
  private readonly fallbackMap = new Map<string, Quote>();

  constructor(
    private readonly requestStore: RequestStore,
    private readonly persistence?: CollectionPersistence<Quote>,
  ) {}

  private async getInner(id: string): Promise<Quote | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }

  private async listInner(): Promise<Quote[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMap.values()];
  }

  private async saveInner(quote: Quote): Promise<void> {
    if (this.persistence) {
      await this.persistence.save(quote);
    } else {
      this.fallbackMap.set(quote.id, quote);
    }
  }

  async createQuote(input: CreateQuoteInput): Promise<Quote> {
    const request = await this.requestStore.get(input.requestId);
    if (!request) throw new QuoteValidationError('요청을 찾을 수 없습니다.');
    if (request.status !== 'REQUESTED') {
      throw new QuoteValidationError('매칭 대기중(REQUESTED) 요청에만 견적을 제시할 수 있습니다.');
    }
    if (input.party !== 'TRANSPORT' && input.party !== 'DISPOSAL') {
      throw new QuoteValidationError('party 는 TRANSPORT | DISPOSAL 이어야 합니다.');
    }
    if (!input.providerId) throw new QuoteValidationError('providerId 가 필요합니다.');
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new QuoteValidationError('견적가는 1원 이상의 정수(원)여야 합니다.');
    }

    const quote: Quote = {
      id: randomUUID(),
      requestId: input.requestId,
      providerId: input.providerId,
      party: input.party,
      amount: input.amount,
      ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
      createdAt: new Date().toISOString(),
    };
    await this.saveInner(quote);
    return quote;
  }

  async accept(quoteId: string, accepterId: string): Promise<Quote> {
    const quote = await this.getInner(quoteId);
    if (!quote) throw new QuoteValidationError('견적을 찾을 수 없습니다.');
    const request = await this.requestStore.get(quote.requestId);
    if (!request) throw new QuoteValidationError('요청을 찾을 수 없습니다.');
    if (request.requesterId !== accepterId) {
      throw new QuoteValidationError('본인 요청의 견적만 수락할 수 있습니다.');
    }
    
    const allQuotes = await this.listInner();
    for (const q of allQuotes) {
      if (q.requestId === quote.requestId && q.party === quote.party && q.accepted) {
        await this.saveInner({ ...q, accepted: false });
      }
    }
    const accepted: Quote = { ...quote, accepted: true };
    await this.saveInner(accepted);

    if (request.status === 'REQUESTED') {
      await this.requestStore.changeStatus(quote.requestId, 'MATCHED', {
        matchedProviderId: quote.providerId,
        agreedFee: quote.amount,
      });
    }
    return accepted;
  }

  async acceptedFees(requestId: string): Promise<{ transportFee: number; disposalFee: number }> {
    let transportFee = 0;
    let disposalFee = 0;
    const allQuotes = await this.listInner();
    for (const q of allQuotes) {
      if (q.requestId !== requestId || !q.accepted) continue;
      if (q.party === 'TRANSPORT') transportFee = q.amount;
      else if (q.party === 'DISPOSAL') disposalFee = q.amount;
    }
    return { transportFee, disposalFee };
  }

  async listQuotes(filter: { requestId?: string; providerId?: string; party?: ProviderRole } = {}): Promise<Quote[]> {
    const allQuotes = await this.listInner();
    return allQuotes
      .filter(
        (q) =>
          (filter.requestId === undefined || q.requestId === filter.requestId) &&
          (filter.providerId === undefined || q.providerId === filter.providerId) &&
          (filter.party === undefined || q.party === filter.party),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async marketRate(party: ProviderRole): Promise<MarketRate> {
    const quotes = await this.listQuotes({ party });
    if (quotes.length === 0) {
      return {
        party,
        quoteCount: 0,
        averageAmount: null,
        minAmount: null,
        maxAmount: null,
        averagePerTon: null,
      };
    }

    const amounts = quotes.map((q) => q.amount);
    
    const perTon: number[] = [];
    for (const q of quotes) {
      const request = await this.requestStore.get(q.requestId);
      const tons = request?.wasteTons;
      if (tons !== undefined && tons > 0) {
        perTon.push(q.amount / tons);
      }
    }

    return {
      party,
      quoteCount: quotes.length,
      averageAmount: Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length),
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      averagePerTon:
        perTon.length === 0
          ? null
          : Math.round(perTon.reduce((s, a) => s + a, 0) / perTon.length),
    };
  }
}
