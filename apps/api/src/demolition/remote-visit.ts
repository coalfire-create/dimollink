import {
  planRemoteSiteVisit,
  validateFinalEstimate,
  type DemolitionEstimate,
  type RemoteSurvey,
} from '@dimol/shared';
import { DemolitionEstimateError, type DemolitionEstimateStore } from './store.js';

/**
 * 원격 실사로 진행 — 업체가 가상 현장 검토 화면에서 "현장에 안 가고 이 자료로 실사를 마친다"를
 * 견적에 남긴다. 규칙은 공유 순수 함수([[remote-site-visit]] planRemoteSiteVisit)에 있고,
 * 여기서는 권한(이 견적의 업체 본인만)과 순서(판정 → 저장 → 알림)만 지킨다.
 *
 * 방문 실사 흐름(소비자 예약 → 업체 확정)은 건드리지 않는다. 이 서비스는 업체가 **원격을
 * 고를 때만** 끼어든다.
 */

export interface RemoteVisitDeps {
  estimates: DemolitionEstimateStore;
  /** 요청의 원격 실사 패키지. 원격 실사 저장소를 직접 알지 않도록 함수로 받는다(배선은 app.ts). */
  surveyByRequest: (requestId: string) => Promise<RemoteSurvey | undefined>;
  /** 요청자 id — 방문 실사를 원격으로 바꿨을 때 알린다. */
  requesterOf: (requestId: string) => Promise<string | undefined>;
  notify?: (requestId: string, userId: string, message: string) => void | Promise<void>;
}

export class RemoteSiteVisitService {
  constructor(private readonly deps: RemoteVisitDeps) {}

  /** 실사를 원격으로 기록한다. 두 번 불러도 한 번(같은 패키지면 그대로 돌려준다). */
  async markRemote(estimateId: string, providerId: string): Promise<DemolitionEstimate> {
    const estimate = await this.requireOwn(estimateId, providerId);
    return this.apply(estimate);
  }

  /**
   * 원격 실사 기준으로 확정 견적을 낸다. 금액 검증을 **먼저** 해서, 금액이 틀렸을 때
   * 실사 기록만 바뀌고 끝나는 일이 없게 한다. 확정 자체는 기존 경로(submitFinal)를 그대로 탄다.
   */
  async submitFinalRemote(
    estimateId: string,
    providerId: string,
    amount: number,
    overrunReason: string | undefined,
    memo: string | undefined,
  ): Promise<DemolitionEstimate> {
    const estimate = await this.requireOwn(estimateId, providerId);
    const valid = validateFinalEstimate(estimate, amount, overrunReason);
    if (!valid.ok) throw new DemolitionEstimateError(valid.error!);
    await this.apply(estimate);
    return this.deps.estimates.submitFinal(estimateId, providerId, amount, overrunReason, memo);
  }

  private async apply(estimate: DemolitionEstimate): Promise<DemolitionEstimate> {
    const [survey, siblings] = await Promise.all([
      this.deps.surveyByRequest(estimate.requestId),
      this.deps.estimates.listByRequest(estimate.requestId),
    ]);
    const plan = planRemoteSiteVisit(estimate, survey, siblings, new Date().toISOString());
    if (!plan.ok) throw new DemolitionEstimateError(plan.error);
    if (!plan.changed) return estimate;

    const updated = await this.deps.estimates.recordVisit(estimate.id, plan.visit);
    if (plan.convertedFromInPerson) {
      // 소비자는 업체가 온다고 알고 있다 — 말없이 바꾸면 집에서 기다린다.
      await this.announce(
        estimate.requestId,
        `${estimate.providerName ?? '철거업체'}가 보내 주신 사진으로 실사를 마치기로 했어요. 방문하지 않아요.`,
      );
    }
    return updated;
  }

  private async requireOwn(estimateId: string, providerId: string): Promise<DemolitionEstimate> {
    const estimate = await this.deps.estimates.get(estimateId);
    if (!estimate) throw new DemolitionEstimateError('견적을 찾을 수 없습니다.');
    if (estimate.providerId !== providerId) {
      throw new DemolitionEstimateError('본인 견적만 바꿀 수 있습니다.');
    }
    return estimate;
  }

  /** 알림 실패가 실사 기록을 막지 않게 한다 — 알림은 부가 기능이다. */
  private async announce(requestId: string, message: string): Promise<void> {
    try {
      const requesterId = await this.deps.requesterOf(requestId);
      if (requesterId) await this.deps.notify?.(requestId, requesterId, message);
    } catch {
      // 여기서 막히면 실사 기록이 안 남는다.
    }
  }
}
