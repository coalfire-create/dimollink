import { randomUUID } from 'node:crypto';
import {
  computeParityReport,
  deriveParitySample,
  structureCodeOf,
  totalFloorAreaM2,
  validateManualParityInput,
  type DemolitionEstimate,
  type ParityReport,
  type ParitySample,
} from '@dimol/shared';
import type { DemolitionEstimateStore } from '../demolition/store.js';
import type { RequestStore } from '../requests/store.js';
import type { ParitySampleStore } from './store.js';

/**
 * 원격 vs 방문 견적 정합성 — 표본을 만들고 고친다. 계산은 공유 순수 함수가 한다.
 *
 * 철거 견적은 **읽기만** 한다. 여기서 견적·결제·올바로 데이터를 바꾸는 일은 없다.
 */

export class ParityValidationError extends Error {}

/**
 * 요청 id → 실제 처리 톤수(올바로 처리 실적). 모르면 undefined.
 *
 * ⚠️ 2026-10 현재 반입·계량(`/allbaro/disposal-info` 의 weighedTons)은 올바로로
 * 보내기만 하고 요청에 남기지 않는다(manifest-service 의 TODO(persistence)).
 * 그래서 앱은 아직 이 조회를 주입하지 않고, 실적 톤은 직원이 입력한다. 올바로 실적이
 * 저장되기 시작하면 여기만 연결하면 된다 — 조회는 읽기 전용이어야 한다.
 */
export type ActualTonnageLookup = (requestId: string) => Promise<number | undefined>;

/** AUTO 표본 id — 요청당 하나라서 다시 계산해도 같은 자리에 덮어쓴다. */
export function autoSampleId(requestId: string): string {
  return `auto:${requestId}`;
}

export interface RefreshSummary {
  /** 새로 만든 AUTO 표본 수. */
  created: number;
  /** 금액이 바뀌어 갱신한 AUTO 표본 수. */
  updated: number;
  /** 더 이상 원격·방문이 둘 다 없어 지운 AUTO 표본 수. */
  removed: number;
}

function sameAmounts(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export class EstimateParityService {
  constructor(
    private readonly samples: ParitySampleStore,
    private readonly estimates: DemolitionEstimateStore,
    private readonly requests: RequestStore,
    private readonly lookupActualTon?: ActualTonnageLookup,
  ) {}

  async listWithReport(): Promise<{ report: ParityReport; samples: ParitySample[] }> {
    const samples = await this.samples.list();
    return { report: computeParityReport(samples), samples };
  }

  /** 시범 현장 직원 입력. 검증 규칙은 화면과 공유한다. */
  async addManual(body: unknown): Promise<ParitySample> {
    const input = validateManualParityInput(body);
    if (typeof input === 'string') throw new ParityValidationError(input);
    const sample: ParitySample = {
      id: randomUUID(),
      ...input,
      source: 'MANUAL',
      createdAt: new Date().toISOString(),
    };
    await this.samples.save(sample);
    return sample;
  }

  /** 철거 후 실적 톤 입력(올바로 처리 실적·계량표를 보고 직원이 적는다). */
  async setActualTon(id: string, raw: unknown): Promise<ParitySample> {
    const sample = await this.samples.get(id);
    if (!sample) throw new ParityValidationError('표본을 찾을 수 없습니다.');
    const actualTon = Number(raw);
    if (!Number.isFinite(actualTon) || actualTon <= 0) {
      throw new ParityValidationError('실적 톤수는 0보다 큰 숫자여야 합니다.');
    }
    const updated = { ...sample, actualTon };
    await this.samples.save(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.samples.get(id))) throw new ParityValidationError('표본을 찾을 수 없습니다.');
    await this.samples.delete(id);
  }

  /**
   * 현재 철거 견적에서 AUTO 표본을 다시 만든다(멱등).
   * MANUAL 표본은 건드리지 않는다. 이미 입력된 실적 톤은 조회 결과가 없으면 유지한다.
   */
  async refreshAuto(): Promise<RefreshSummary> {
    const byRequest = new Map<string, DemolitionEstimate[]>();
    for (const e of await this.estimates.listAll()) {
      const list = byRequest.get(e.requestId) ?? [];
      list.push(e);
      byRequest.set(e.requestId, list);
    }

    const existing = (await this.samples.list()).filter((s) => s.source === 'AUTO');
    const existingById = new Map(existing.map((s) => [s.id, s]));
    const keep = new Set<string>();
    const summary: RefreshSummary = { created: 0, updated: 0, removed: 0 };

    for (const [requestId, list] of byRequest) {
      const derived = deriveParitySample(list);
      if (!derived) continue;
      const id = autoSampleId(requestId);
      keep.add(id);
      const prev = existingById.get(id);
      const request = await this.requests.get(requestId);
      const ledger = request?.kind === 'DEMOLITION' ? request.demolitionDetails?.buildingLedger : undefined;
      const looked = this.lookupActualTon ? await this.lookupActualTon(requestId) : undefined;

      const next: ParitySample = {
        id,
        requestId,
        structure: structureCodeOf(ledger),
        floorAreaM2: totalFloorAreaM2(ledger),
        remoteFinalAmounts: derived.remoteFinalAmounts,
        inPersonFinalAmounts: derived.inPersonFinalAmounts,
        estimatedTon: request && request.wasteTons > 0 ? request.wasteTons : undefined,
        actualTon: looked ?? prev?.actualTon,
        source: 'AUTO',
        note: prev?.note,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
      if (!prev) summary.created += 1;
      else if (
        sameAmounts(prev.remoteFinalAmounts, next.remoteFinalAmounts) &&
        sameAmounts(prev.inPersonFinalAmounts, next.inPersonFinalAmounts) &&
        prev.actualTon === next.actualTon &&
        prev.estimatedTon === next.estimatedTon
      ) {
        continue;
      } else summary.updated += 1;
      await this.samples.save(next);
    }

    for (const s of existing) {
      if (!keep.has(s.id)) {
        await this.samples.delete(s.id);
        summary.removed += 1;
      }
    }
    return summary;
  }
}
