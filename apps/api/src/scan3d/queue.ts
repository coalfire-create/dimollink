import { randomUUID } from 'node:crypto';
import {
  scan3DProgress,
  volumeFromRawUnits,
  type Scan3DJob,
  type Scan3DResult,
  type Scan3DStage,
} from '@dimol/shared';

/**
 * 3D 복원 잡 큐.
 *
 * `SiteAnalysisQueue` 와 같은 인메모리 패턴이되 **단계(stage)** 를 함께 들고 간다 —
 * 복원은 20~40분 걸려서, 사용자에게 "지금 뭘 하는 중인지"를 못 보여주면 앱이 멈춘 것처럼 보인다.
 *
 * 인메모리라 서버 재시작 시 진행 중 잡은 사라진다. 실제 복원은 GPU 워커가 수행하고
 * 결과는 스토리지에 남으므로, 잡 유실은 "진행률을 못 본다"까지이지 결과 유실은 아니다.
 */
export class Scan3DQueue {
  private readonly jobs = new Map<string, Scan3DJob>();

  createJob(): Scan3DJob {
    const now = new Date().toISOString();
    const job: Scan3DJob = {
      id: randomUUID(),
      status: 'PENDING',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  getJob(id: string): Scan3DJob | undefined {
    return this.jobs.get(id);
  }

  /** 단계 진행 — 진행률은 단계 가중치에서 자동 계산한다(화면이 직접 계산하지 않게). */
  advance(id: string, stage: Scan3DStage): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'IN_PROGRESS';
    job.stage = stage;
    job.progress = scan3DProgress(stage);
    job.updatedAt = new Date().toISOString();
  }

  complete(id: string, result: Scan3DResult): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'COMPLETED';
    job.progress = 1;
    job.result = result;
    job.stage = undefined;
    job.updatedAt = new Date().toISOString();
  }

  fail(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'FAILED';
    job.error = error;
    job.updatedAt = new Date().toISOString();
  }

  /**
   * 기준 물체 재측정으로 배율만 다시 적용한다 — **복원을 다시 돌리지 않는다.**
   * 부피는 배율의 세제곱이라 원시 부피만 있으면 재계산이 공짜다(GPU 비용 0).
   */
  rescale(id: string, factor: number): Scan3DJob | undefined {
    const job = this.jobs.get(id);
    if (!job?.result) return undefined;
    const raw = job.result.rawVolumeUnits;
    if (!raw || raw <= 0) return undefined;

    job.result = {
      ...job.result,
      grossVolumeM3: volumeFromRawUnits(raw, factor),
      scaleSource: 'REFERENCE_OBJECT',
      // 스케일 근거가 생겼으니 "치수 기준 없음" 사유는 사라진다. 나머지 품질 사유는 유지.
      reasons: job.result.reasons.filter((r) => !r.includes('치수 기준')),
      usable: true,
    };
    job.updatedAt = new Date().toISOString();
    return job;
  }

  /** 오래된 완료·실패 잡 정리(메모리 누수 방지). */
  prune(maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now()): number {
    let removed = 0;
    for (const [id, job] of this.jobs) {
      const done = job.status === 'COMPLETED' || job.status === 'FAILED';
      if (done && now - Date.parse(job.updatedAt) > maxAgeMs) {
        this.jobs.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}
