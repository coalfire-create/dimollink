import { randomUUID } from 'node:crypto';
import type { SiteAnalysis } from '@dimol/shared';

export type JobStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface SiteAnalysisJob {
  id: string;
  status: JobStatus;
  result?: SiteAnalysis;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class SiteAnalysisQueue {
  private readonly jobs = new Map<string, SiteAnalysisJob>();

  createJob(): SiteAnalysisJob {
    const now = new Date().toISOString();
    const job: SiteAnalysisJob = {
      id: randomUUID(),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  getJob(id: string): SiteAnalysisJob | undefined {
    return this.jobs.get(id);
  }

  updateJob(id: string, updates: Partial<Pick<SiteAnalysisJob, 'status' | 'result' | 'error'>>) {
    const job = this.jobs.get(id);
    if (!job) return;
    const now = new Date().toISOString();
    Object.assign(job, updates, { updatedAt: now });
  }
}
