import type { SiteAnalysis, BuildingLedgerInfo } from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';

export interface SiteAnalysisRecord {
  id: string; // Job ID
  photoKey: string; // S3 Key for the uploaded photo
  result?: SiteAnalysis;
  error?: string;
  buildingLedger?: BuildingLedgerInfo;
  siteAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export class SiteAnalysisStore {
  constructor(private readonly persistence: CollectionPersistence<SiteAnalysisRecord>) {}

  async create(record: SiteAnalysisRecord): Promise<void> {
    await this.persistence.save(record);
  }

  async update(id: string, partial: Partial<SiteAnalysisRecord>): Promise<void> {
    const existing = await this.persistence.get(id);
    if (existing) {
      await this.persistence.save({ ...existing, ...partial, updatedAt: new Date().toISOString() });
    }
  }

  async get(id: string): Promise<SiteAnalysisRecord | undefined> {
    return this.persistence.get(id);
  }

  async list(): Promise<SiteAnalysisRecord[]> {
    return this.persistence.list();
  }
}
