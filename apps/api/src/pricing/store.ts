import type { ProviderPricing } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

export class PricingValidationError extends Error {}

export class PricingStore {
  private readonly fallbackMap = new Map<string, ProviderPricing>();

  constructor(private readonly persistence?: CollectionPersistence<ProviderPricing>) {}

  private async getInner(userId: string): Promise<ProviderPricing | undefined> {
    if (this.persistence) return this.persistence.get(userId);
    return this.fallbackMap.get(userId);
  }

  private async listInner(): Promise<ProviderPricing[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMap.values()];
  }

  private async saveInner(record: ProviderPricing): Promise<void> {
    if (this.persistence) await this.persistence.save(record);
    else this.fallbackMap.set(record.userId, record);
  }

  async get(userId: string): Promise<ProviderPricing | undefined> {
    return this.getInner(userId);
  }

  async list(): Promise<ProviderPricing[]> {
    const all = await this.listInner();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async set(userId: string, unitPrice: number): Promise<ProviderPricing> {
    if (!userId) throw new PricingValidationError('userId 가 필요합니다.');
    if (!Number.isInteger(unitPrice) || unitPrice <= 0) {
      throw new PricingValidationError('단가는 1원 이상의 정수(원)여야 합니다.');
    }
    const record: ProviderPricing = { userId, unitPrice, updatedAt: new Date().toISOString() };
    await this.saveInner(record);
    return record;
  }
}
