import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import { ReviewStore, ReviewValidationError } from './store.js';

/** 매칭 확정 → 완료 상태의 요청을 만든다 (배출자 d-1, 업체 p-1). */
async function completedRequest(requestStore: RequestStore): Promise<string> {
  const r = await requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'd-1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 7,
    allbaroRequested: false,
    siteAddress: '양평군 현장',
  });
  await requestStore.changeStatus(r.id, 'MATCHED', { matchedProviderId: 'p-1' });
  await requestStore.changeStatus(r.id, 'PAID');
  await requestStore.changeStatus(r.id, 'IN_PROGRESS');
  await requestStore.changeStatus(r.id, 'COMPLETED');
  return r.id;
}

function setup() {
  const requestStore = new RequestStore();
  const store = new ReviewStore(requestStore);
  return { requestStore, store };
}

describe('ReviewStore.createReview', () => {
  it('완료된 요청의 당사자만 상호 평가 가능', async () => {
    const { requestStore, store } = setup();
    const requestId = await completedRequest(requestStore);

    const byDischarger = await store.createReview({ requestId, raterId: 'd-1', rating: 5 });
    expect(byDischarger.ratedId).toBe('p-1');
    const byProvider = await store.createReview({ requestId, raterId: 'p-1', rating: 4 });
    expect(byProvider.ratedId).toBe('d-1');

    await expect(store.createReview({ requestId, raterId: 'stranger', rating: 3 })).rejects.toThrow(
      ReviewValidationError,
    );
  });

  it('완료 전 요청은 평가 불가', async () => {
    const { requestStore, store } = setup();
    const r = await requestStore.create({
      kind: 'DEMOLITION',
      requesterId: 'd-1',
      region: '양평',
      wasteCategory: 'CONSTRUCTION',
      wasteTons: 7,
      allbaroRequested: false,
      siteAddress: '양평군 현장',
    });
    await requestStore.changeStatus(r.id, 'MATCHED', { matchedProviderId: 'p-1' });
    await expect(store.createReview({ requestId: r.id, raterId: 'd-1', rating: 5 })).rejects.toThrow(
      ReviewValidationError,
    );
  });

  it('요청당 평가자별 1회 (중복 거부), 평점 범위 1~5 정수', async () => {
    const { requestStore, store } = setup();
    const requestId = await completedRequest(requestStore);
    await store.createReview({ requestId, raterId: 'd-1', rating: 5 });
    await expect(store.createReview({ requestId, raterId: 'd-1', rating: 4 })).rejects.toThrow(
      ReviewValidationError,
    );
    for (const rating of [0, 6, 3.5]) {
      await expect(store.createReview({ requestId, raterId: 'p-1', rating })).rejects.toThrow(
        ReviewValidationError,
      );
    }
  });
});

describe('ReviewStore.ratingSummary — 평점·이력 집계', () => {
  it('평균 평점(소수 2자리)과 노쇼/분쟁 누적 집계', async () => {
    const { requestStore, store } = setup();
    const r1 = await completedRequest(requestStore);
    const r2 = await completedRequest(requestStore);
    await store.createReview({ requestId: r1, raterId: 'd-1', rating: 5 });
    await store.createReview({ requestId: r2, raterId: 'd-1', rating: 4 });
    await store.reportIncident({ requestId: r1, reporterId: 'd-1', type: 'NO_SHOW' });
    await store.reportIncident({ requestId: r2, reporterId: 'd-1', type: 'DISPUTE', detail: '중량 이견' });

    const summary = await store.ratingSummary('p-1');
    expect(summary.average).toBe(4.5);
    expect(summary.reviewCount).toBe(2);
    expect(summary.noShowCount).toBe(1);
    expect(summary.disputeCount).toBe(1);
  });

  it('리뷰 없으면 average null', async () => {
    const { store } = setup();
    expect((await store.ratingSummary('nobody')).average).toBeNull();
  });
});

describe('ReviewStore — 인시던트', () => {
  it('당사자만 신고 가능, OPEN 으로 시작, 조정 완료 처리', async () => {
    const { requestStore, store } = setup();
    const requestId = await completedRequest(requestStore);
    const incident = await store.reportIncident({ requestId, reporterId: 'p-1', type: 'DISPUTE' });
    expect(incident.targetId).toBe('d-1');
    expect(incident.status).toBe('OPEN');

    const resolved = await store.resolveIncident(incident.id, '양측 합의');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionNote).toBe('양측 합의');
    expect(await store.listIncidents({ status: 'OPEN' })).toHaveLength(0);
  });
});
