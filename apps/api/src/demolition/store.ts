import { randomUUID } from 'node:crypto';
import {
  canScheduleMoreVisits,
  validateFinalEstimate,
  validatePreliminaryRange,
  type DemolitionEstimate,
} from '@dimol/shared';
import type { CollectionPersistence } from '../lib/json-collection.js';
import type { RequestStore } from '../requests/store.js';

/**
 * 철거 견적 저장소 — 개산 → 실사 → 확정.
 *
 * 규칙(범위 검증·초과 사유·실사 상한)은 전부 공유 순수 함수([[demolition-estimate]])에 있다.
 * 여기서는 순서와 권한만 지킨다 — 같은 판정이 화면과 서버에서 갈라지면 안 된다.
 */

export class DemolitionEstimateError extends Error {}

export interface CreatePreliminaryInput {
  requestId: string;
  providerId: string;
  providerName?: string;
  minAmount: number;
  maxAmount: number;
  memo?: string;
}

export class DemolitionEstimateStore {
  private readonly fallbackMap = new Map<string, DemolitionEstimate>();

  constructor(
    private readonly requestStore: RequestStore,
    private readonly persistence?: CollectionPersistence<DemolitionEstimate>,
  ) {}

  private async listInner(): Promise<DemolitionEstimate[]> {
    if (this.persistence) return this.persistence.list();
    return [...this.fallbackMap.values()];
  }

  private async save(estimate: DemolitionEstimate): Promise<void> {
    if (this.persistence) await this.persistence.save(estimate);
    else this.fallbackMap.set(estimate.id, estimate);
  }

  async get(id: string): Promise<DemolitionEstimate | undefined> {
    if (this.persistence) return this.persistence.get(id);
    return this.fallbackMap.get(id);
  }

  /** 한 요청의 견적 전체(밀봉 필터는 라우트가 적용한다). */
  async listByRequest(requestId: string): Promise<DemolitionEstimate[]> {
    return (await this.listInner())
      .filter((e) => e.requestId === requestId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listByProvider(providerId: string): Promise<DemolitionEstimate[]> {
    return (await this.listInner()).filter((e) => e.providerId === providerId);
  }

  async listAll(): Promise<DemolitionEstimate[]> {
    return this.listInner();
  }

  /** 1단계 — 업체가 사진·대장을 보고 개산 범위를 제출한다. 구속력은 없다. */
  async createPreliminary(input: CreatePreliminaryInput): Promise<DemolitionEstimate> {
    const request = await this.requestStore.get(input.requestId);
    if (!request) throw new DemolitionEstimateError('요청을 찾을 수 없습니다.');
    if (request.kind !== 'DEMOLITION') {
      throw new DemolitionEstimateError('철거 요청에만 개산 견적을 낼 수 있습니다.');
    }
    if (request.status !== 'REQUESTED') {
      throw new DemolitionEstimateError('매칭 대기중인 요청에만 견적을 낼 수 있습니다.');
    }

    const valid = validatePreliminaryRange(input.minAmount, input.maxAmount);
    if (!valid.ok) throw new DemolitionEstimateError(valid.error!);

    const existing = (await this.listByRequest(input.requestId)).find(
      (e) => e.providerId === input.providerId,
    );
    if (existing) {
      throw new DemolitionEstimateError('이미 이 요청에 개산 견적을 제출했습니다.');
    }

    const estimate: DemolitionEstimate = {
      id: randomUUID(),
      requestId: input.requestId,
      providerId: input.providerId,
      providerName: input.providerName,
      stage: 'PRELIMINARY',
      preliminary: {
        minAmount: input.minAmount,
        maxAmount: input.maxAmount,
        memo: input.memo,
        createdAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    };
    await this.save(estimate);
    return estimate;
  }

  /**
   * 2단계 — 소비자가 개산 견적 중 한 곳을 골라 실사를 예약한다.
   * 상한을 넘기면 거부한다: 무분별하게 부르면 업체는 헛걸음만 하고 그 비용이 견적에 얹힌다.
   */
  async scheduleVisit(
    estimateId: string,
    requesterId: string,
    scheduledAt: string,
  ): Promise<DemolitionEstimate> {
    const estimate = await this.requireEstimate(estimateId);
    const request = await this.requestStore.get(estimate.requestId);
    if (!request) throw new DemolitionEstimateError('요청을 찾을 수 없습니다.');
    if (request.requesterId !== requesterId) {
      throw new DemolitionEstimateError('본인 요청에만 실사를 예약할 수 있습니다.');
    }
    if (estimate.visit) throw new DemolitionEstimateError('이미 실사가 예약된 업체입니다.');
    if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
      throw new DemolitionEstimateError('실사 일시를 정확히 입력해 주세요.');
    }

    const siblings = await this.listByRequest(estimate.requestId);
    if (!canScheduleMoreVisits(siblings)) {
      throw new DemolitionEstimateError(
        '실사는 최대 3곳까지 예약할 수 있습니다. 한 곳을 취소한 뒤 다시 시도해 주세요.',
      );
    }

    const updated: DemolitionEstimate = {
      ...estimate,
      stage: 'VISIT_SCHEDULED',
      visit: { scheduledAt },
    };
    await this.save(updated);
    return updated;
  }

  /** 실사 예약을 물린다 — 자리를 비워야 다른 업체를 부를 수 있다. */
  async cancelVisit(estimateId: string, requesterId: string): Promise<DemolitionEstimate> {
    const estimate = await this.requireEstimate(estimateId);
    const request = await this.requestStore.get(estimate.requestId);
    if (request?.requesterId !== requesterId) {
      throw new DemolitionEstimateError('본인 요청에만 실사를 취소할 수 있습니다.');
    }
    if (estimate.final) throw new DemolitionEstimateError('확정 견적이 나온 뒤에는 되돌릴 수 없습니다.');
    const updated: DemolitionEstimate = {
      ...estimate,
      stage: 'PRELIMINARY',
      visit: undefined,
    };
    await this.save(updated);
    return updated;
  }

  /**
   * 3단계 — 실사를 마친 업체가 확정 금액을 제출한다. 이것이 계약금액이다.
   * 개산 상단을 넘으면 사유가 필수다(소비자에게 그대로 보인다).
   */
  async submitFinal(
    estimateId: string,
    providerId: string,
    amount: number,
    overrunReason: string | undefined,
    memo: string | undefined,
  ): Promise<DemolitionEstimate> {
    const estimate = await this.requireEstimate(estimateId);
    if (estimate.providerId !== providerId) {
      throw new DemolitionEstimateError('본인 견적만 제출할 수 있습니다.');
    }
    if (!estimate.visit) {
      throw new DemolitionEstimateError('현장 실사 후에 확정 견적을 낼 수 있습니다.');
    }

    const valid = validateFinalEstimate(estimate, amount, overrunReason);
    if (!valid.ok) throw new DemolitionEstimateError(valid.error!);

    const updated: DemolitionEstimate = {
      ...estimate,
      stage: 'FINAL',
      visit: { ...estimate.visit, completedAt: estimate.visit.completedAt ?? new Date().toISOString() },
      final: {
        amount,
        overrunReason: overrunReason?.trim() || undefined,
        memo,
        createdAt: new Date().toISOString(),
      },
    };
    await this.save(updated);
    return updated;
  }

  /**
   * 소비자가 확정 견적을 수락 → 매칭 확정. 여기서 비로소 계약금액이 정해진다.
   * 나머지 업체는 자동으로 정리한다(계속 열려 있으면 헛일을 한다).
   */
  async accept(estimateId: string, requesterId: string): Promise<DemolitionEstimate> {
    const estimate = await this.requireEstimate(estimateId);
    const request = await this.requestStore.get(estimate.requestId);
    if (!request) throw new DemolitionEstimateError('요청을 찾을 수 없습니다.');
    if (request.requesterId !== requesterId) {
      throw new DemolitionEstimateError('본인 요청의 견적만 수락할 수 있습니다.');
    }
    if (!estimate.final) throw new DemolitionEstimateError('확정 견적이 아직 없습니다.');

    await this.requestStore.changeStatus(estimate.requestId, 'MATCHED', {
      matchedProviderId: estimate.providerId,
      agreedFee: estimate.final.amount,
    });

    const accepted: DemolitionEstimate = { ...estimate, accepted: true };
    await this.save(accepted);

    // 떨어진 업체는 더 진행하지 않도록 닫는다.
    for (const other of await this.listByRequest(estimate.requestId)) {
      if (other.id === estimate.id || other.stage === 'DECLINED') continue;
      await this.save({ ...other, stage: 'DECLINED' });
    }
    return accepted;
  }

  private async requireEstimate(id: string): Promise<DemolitionEstimate> {
    const estimate = await this.get(id);
    if (!estimate) throw new DemolitionEstimateError('견적을 찾을 수 없습니다.');
    return estimate;
  }
}
