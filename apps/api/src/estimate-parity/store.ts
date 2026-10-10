import type { ParitySample } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

/**
 * 정합성 표본 저장소 — 저장만 한다. 판정 규칙은 [[estimate-parity]](공유), 표본을 만드는
 * 규칙은 [[service]] 에 있다.
 */
export class ParitySampleStore {
  private readonly fallbackMap = new Map<string, ParitySample>();

  constructor(private readonly persistence?: CollectionPersistence<ParitySample>) {}

  async list(): Promise<ParitySample[]> {
    const all = this.persistence ? await this.persistence.list() : [...this.fallbackMap.values()];
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<ParitySample | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }

  async save(sample: ParitySample): Promise<void> {
    if (this.persistence) await this.persistence.save(sample);
    else this.fallbackMap.set(sample.id, sample);
  }

  async delete(id: string): Promise<void> {
    if (this.persistence) await this.persistence.delete(id);
    else this.fallbackMap.delete(id);
  }
}
