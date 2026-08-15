import type { ProviderPricing } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 업체 단가 저장소 (로드맵 Phase 2 — 마이페이지 단가 설정).
 * 업체별 기준 단가를 보관한다. 견적 기본값·시세 참고에 쓰인다.
 * 금액 계산에 쓰이므로 검증(양의 정수)을 지킨다.
 */

export class PricingValidationError extends Error {}

export class PricingStore {
  private readonly pricing = new Map<string, ProviderPricing>();

  constructor(private readonly persistence?: CollectionPersistence<ProviderPricing>) {
    for (const p of persistence?.load() ?? []) this.pricing.set(p.userId, p);
  }

  get(userId: string): ProviderPricing | undefined {
    return this.pricing.get(userId);
  }

  list(): ProviderPricing[] {
    return [...this.pricing.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** 업체 단가 설정(원, 양의 정수). 기존 값이 있으면 덮어쓴다. */
  set(userId: string, unitPrice: number): ProviderPricing {
    if (!userId) throw new PricingValidationError('userId 가 필요합니다.');
    if (!Number.isInteger(unitPrice) || unitPrice <= 0) {
      throw new PricingValidationError('단가는 1원 이상의 정수(원)여야 합니다.');
    }
    const record: ProviderPricing = { userId, unitPrice, updatedAt: new Date().toISOString() };
    this.pricing.set(userId, record);
    this.persistence?.save([...this.pricing.values()]);
    return record;
  }
}
