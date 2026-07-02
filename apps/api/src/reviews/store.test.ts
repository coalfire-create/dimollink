import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import { ReviewStore, ReviewValidationError } from './store.js';

/** 매칭 확정 → 완료 상태의 요청을 만든다 (배출자 d-1, 업체 p-1). */
function completedRequest(requestStore: RequestStore): string {
  const r = requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'd-1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 7,
    allbaroRequested: false,
    siteAddress: '양평군 현장',
  });
  requestStore.changeStatus(r.id, 'MATCHED', { matchedProviderId: 'p-1' });
  requestStore.changeStatus(r.id, 'PAID');
  requestStore.changeStatus(r.id, 'IN_PROGRESS');
  requestStore.changeStatus(r.id, 'COMPLETED');
  return r.id;
}

function setup() {
  const requestStore = new RequestStore();
  const store = new ReviewStore(requestStore);
  return { requestStore, store };
}

describe('ReviewStore.createReview', () => {
  it('완료된 요청의 당사자만 상호 평가 가능', () => {
    const { requestStore, store } = setup();
    const requestId = completedRequest(requestStore);

    const byDischarger = store.createReview({ requestId, raterId: 'd-1', rating: 5 });
    expect(byDischarger.ratedId).toBe('p-1');
    const byProvider = store.createReview({ requestId, raterId: 'p-1', rating: 4 });
    expect(byProvider.ratedId).toBe('d-1');

    expect(() => store.createReview({ requestId, raterId: 'stranger', rating: 3 })).toThrow(
      ReviewValidationError,
    );
  });

  it('완료 전 요청은 평가 불가', () => {
    const { requestStore, store } = setup();
    const r = requestStore.create({
      kind: 'DEMOLITION',
      requesterId: 'd-1',
      region: '양평',
      wasteCategory: 'CONSTRUCTION',
      wasteTons: 7,
      allbaroRequested: false,
      siteAddress: '양평군 현장',
    });
    requestStore.changeStatus(r.id, 'MATCHED', { matchedProviderId: 'p-1' });
    expect(() => store.createReview({ requestId: r.id, raterId: 'd-1', rating: 5 })).toThrow(
      ReviewValidationError,
    );
  });

  it('요청당 평가자별 1회 (중복 거부), 평점 범위 1~5 정수', () => {
    const { requestStore, store } = setup();
    const requestId = completedRequest(requestStore);
    store.createReview({ requestId, raterId: 'd-1', rating: 5 });
    expect(() => store.createReview({ requestId, raterId: 'd-1', rating: 4 })).toThrow(
      ReviewValidationError,
    );
    for (const rating of [0, 6, 3.5]) {
      expect(() => store.createReview({ requestId, raterId: 'p-1', rating })).toThrow(
        ReviewValidationError,
      );
    }
  });
});

describe('ReviewStore.ratingSummary — 평점·이력 집계', () => {
  it('평균 평점(소수 2자리)과 노쇼/분쟁 누적 집계', () => {
    const { requestStore, store } = setup();
    const r1 = completedRequest(requestStore);
    const r2 = completedRequest(requestStore);
    store.createReview({ requestId: r1, raterId: 'd-1', rating: 5 });
    store.createReview({ requestId: r2, raterId: 'd-1', rating: 4 });
    store.reportIncident({ requestId: r1, reporterId: 'd-1', type: 'NO_SHOW' });
    store.reportIncident({ requestId: r2, reporterId: 'd-1', type: 'DISPUTE', detail: '중량 이견' });

    const summary = store.ratingSummary('p-1');
    expect(summary.average).toBe(4.5);
    expect(summary.reviewCount).toBe(2);
    expect(summary.noShowCount).toBe(1);
    expect(summary.disputeCount).toBe(1);
  });

  it('리뷰 없으면 average null', () => {
    const { store } = setup();
    expect(store.ratingSummary('nobody').average).toBeNull();
  });
});

describe('ReviewStore — 인시던트', () => {
  it('당사자만 신고 가능, OPEN 으로 시작, 조정 완료 처리', () => {
    const { requestStore, store } = setup();
    const requestId = completedRequest(requestStore);
    const incident = store.reportIncident({ requestId, reporterId: 'p-1', type: 'DISPUTE' });
    expect(incident.targetId).toBe('d-1');
    expect(incident.status).toBe('OPEN');

    const resolved = store.resolveIncident(incident.id, '양측 합의');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionNote).toBe('양측 합의');
    expect(store.listIncidents({ status: 'OPEN' })).toHaveLength(0);
  });
});
