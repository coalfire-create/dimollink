import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import { QuoteStore, QuoteValidationError } from './store.js';

function setup() {
  const requestStore = new RequestStore();
  const store = new QuoteStore(requestStore);
  return { requestStore, store };
}

function createRequest(requestStore: RequestStore, wasteTons = 10) {
  return requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'd-1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons,
    allbaroRequested: false,
    siteAddress: '양평군 현장',
  });
}

describe('QuoteStore.createQuote', () => {
  it('대기중 요청에 견적 제시, 히스토리로 누적 (재견적 허용)', () => {
    const { requestStore, store } = setup();
    const r = createRequest(requestStore);
    store.createQuote({ requestId: r.id, providerId: 'p-1', party: 'TRANSPORT', amount: 3_000_000 });
    store.createQuote({ requestId: r.id, providerId: 'p-1', party: 'TRANSPORT', amount: 2_800_000 });
    expect(store.listQuotes({ requestId: r.id, providerId: 'p-1' })).toHaveLength(2);
  });

  it('매칭 확정된 요청에는 견적 불가', () => {
    const { requestStore, store } = setup();
    const r = createRequest(requestStore);
    requestStore.changeStatus(r.id, 'MATCHED', { matchedProviderId: 'p-1' });
    expect(() =>
      store.createQuote({ requestId: r.id, providerId: 'p-2', party: 'TRANSPORT', amount: 1_000 }),
    ).toThrow(QuoteValidationError);
  });

  it('없는 요청·0원 이하·소수점 견적 거부', () => {
    const { requestStore, store } = setup();
    const r = createRequest(requestStore);
    expect(() =>
      store.createQuote({ requestId: 'nope', providerId: 'p-1', party: 'TRANSPORT', amount: 1_000 }),
    ).toThrow('요청을 찾을 수 없습니다.');
    for (const amount of [0, -1, 1000.5]) {
      expect(() =>
        store.createQuote({ requestId: r.id, providerId: 'p-1', party: 'TRANSPORT', amount }),
      ).toThrow(QuoteValidationError);
    }
  });
});

describe('QuoteStore.marketRate — 평균 시세', () => {
  it('party 별 평균/최소/최대 + 톤당 단가 집계', () => {
    const { requestStore, store } = setup();
    const r10 = createRequest(requestStore, 10); // 300만 → 30만/톤
    const r5 = createRequest(requestStore, 5); //   200만 → 40만/톤
    store.createQuote({ requestId: r10.id, providerId: 'p-1', party: 'TRANSPORT', amount: 3_000_000 });
    store.createQuote({ requestId: r5.id, providerId: 'p-2', party: 'TRANSPORT', amount: 2_000_000 });
    store.createQuote({ requestId: r10.id, providerId: 'p-3', party: 'DISPOSAL', amount: 7_000_000 });

    const rate = store.marketRate('TRANSPORT');
    expect(rate.quoteCount).toBe(2);
    expect(rate.averageAmount).toBe(2_500_000);
    expect(rate.minAmount).toBe(2_000_000);
    expect(rate.maxAmount).toBe(3_000_000);
    expect(rate.averagePerTon).toBe(350_000);
  });

  it('견적 없으면 전부 null', () => {
    const { store } = setup();
    const rate = store.marketRate('DISPOSAL');
    expect(rate.quoteCount).toBe(0);
    expect(rate.averageAmount).toBeNull();
    expect(rate.averagePerTon).toBeNull();
  });
});
