import { randomUUID } from 'node:crypto';
import type { MarketRate, ProviderRole, Quote } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

/**
 * 견적 히스토리 저장소 (로드맵 Phase 3).
 * 업체가 요청 건에 견적을 제시하면 기록만 한다 — 매칭 확정/결제는 별도 플로우.
 * 같은 업체가 여러 번 제시할 수 있고 전부 히스토리로 남는다 (최신이 유효 견적).
 */

export class QuoteValidationError extends Error {}

export interface CreateQuoteInput {
  requestId: string;
  providerId: string;
  party: ProviderRole;
  amount: number;
  memo?: string;
}

export class QuoteStore {
  private readonly quotes = new Map<string, Quote>();

  constructor(
    private readonly requestStore: RequestStore,
    private readonly persistence?: CollectionPersistence<Quote>,
  ) {
    for (const quote of persistence?.load() ?? []) this.quotes.set(quote.id, quote);
  }

  createQuote(input: CreateQuoteInput): Quote {
    const request = this.requestStore.get(input.requestId);
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
    this.quotes.set(quote.id, quote);
    this.persistence?.save([...this.quotes.values()]);
    return quote;
  }

  /** 견적 히스토리 (최신순). */
  listQuotes(filter: { requestId?: string; providerId?: string; party?: ProviderRole } = {}): Quote[] {
    return [...this.quotes.values()]
      .filter(
        (q) =>
          (filter.requestId === undefined || q.requestId === filter.requestId) &&
          (filter.providerId === undefined || q.providerId === filter.providerId) &&
          (filter.party === undefined || q.party === filter.party),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * 평균 시세 — 파일럿 범위(양평·건설폐기물) 전체 견적을 집계한다.
   * 톤당 단가는 요청 톤수가 있는 견적만 반영한다.
   */
  marketRate(party: ProviderRole): MarketRate {
    const quotes = this.listQuotes({ party });
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
    const perTon = quotes.flatMap((q) => {
      const tons = this.requestStore.get(q.requestId)?.wasteTons;
      return tons !== undefined && tons > 0 ? [q.amount / tons] : [];
    });

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
