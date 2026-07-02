import { describe, expect, it } from 'vitest';
import { QuoteStore } from '../quotes/store.js';
import { RequestStore } from '../requests/store.js';
import { AnomalyDetector, REPEATED_PAIR_THRESHOLD } from './detect.js';

function setup() {
  const requestStore = new RequestStore();
  const quoteStore = new QuoteStore(requestStore);
  const detector = new AnomalyDetector(requestStore, quoteStore);
  return { requestStore, quoteStore, detector };
}

function matchedRequest(requestStore: RequestStore, requesterId: string, providerId: string) {
  const r = requestStore.create({
    kind: 'DEMOLITION',
    requesterId,
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 7,
    allbaroRequested: false,
    siteAddress: '양평군 현장',
  });
  requestStore.changeStatus(r.id, 'MATCHED', { matchedProviderId: providerId });
  return r;
}

function openRequest(requestStore: RequestStore) {
  return requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'd-x',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 10,
    allbaroRequested: false,
    siteAddress: '양평군 현장',
  });
}

describe('AnomalyDetector — 반복 매칭 쌍', () => {
  it('임계 횟수 이상 반복된 쌍만 플래그', () => {
    const { requestStore, detector } = setup();
    for (let i = 0; i < REPEATED_PAIR_THRESHOLD; i += 1) {
      matchedRequest(requestStore, 'd-1', 'p-1');
    }
    matchedRequest(requestStore, 'd-2', 'p-1'); // 다른 쌍 1회 — 정상

    const flags = detector.detect().filter((f) => f.type === 'REPEATED_PAIR');
    expect(flags).toHaveLength(1);
    expect(flags[0].requesterId).toBe('d-1');
    expect(flags[0].providerId).toBe('p-1');
    expect(flags[0].requestIds).toHaveLength(REPEATED_PAIR_THRESHOLD);
  });

  it('취소된 매칭은 반복 집계에서 제외', () => {
    const { requestStore, detector } = setup();
    for (let i = 0; i < REPEATED_PAIR_THRESHOLD; i += 1) {
      const r = matchedRequest(requestStore, 'd-1', 'p-1');
      requestStore.changeStatus(r.id, 'CANCELLED');
    }
    expect(detector.detect()).toHaveLength(0);
  });
});

describe('AnomalyDetector — 시세 편차 견적', () => {
  it('평균 대비 ±50% 초과 견적을 플래그 (표본 5건 이상일 때)', () => {
    const { requestStore, quoteStore, detector } = setup();
    // 정상 견적 5건 (평균 근처) + 이상 견적 1건
    for (const amount of [1_000_000, 1_050_000, 950_000, 1_000_000, 1_000_000]) {
      quoteStore.createQuote({
        requestId: openRequest(requestStore).id,
        providerId: 'p-normal',
        party: 'TRANSPORT',
        amount,
      });
    }
    const outlier = quoteStore.createQuote({
      requestId: openRequest(requestStore).id,
      providerId: 'p-outlier',
      party: 'TRANSPORT',
      amount: 5_000_000,
    });

    const flags = detector.detect().filter((f) => f.type === 'PRICE_OUTLIER');
    expect(flags).toHaveLength(1);
    expect(flags[0].quoteId).toBe(outlier.id);
    expect(flags[0].providerId).toBe('p-outlier');
  });

  it('표본이 적으면 시세 룰은 침묵 (오탐 방지)', () => {
    const { requestStore, quoteStore, detector } = setup();
    quoteStore.createQuote({
      requestId: openRequest(requestStore).id,
      providerId: 'p-1',
      party: 'TRANSPORT',
      amount: 10_000_000,
    });
    quoteStore.createQuote({
      requestId: openRequest(requestStore).id,
      providerId: 'p-2',
      party: 'TRANSPORT',
      amount: 100_000,
    });
    expect(detector.detect()).toHaveLength(0);
  });
});
