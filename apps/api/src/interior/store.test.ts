import { describe, expect, it } from 'vitest';
import { InteriorStore, InteriorValidationError } from './store.js';

function setup() {
  return new InteriorStore();
}

function createRequest(store: InteriorStore, requesterId = 'consumer-1') {
  return store.createRequest({
    requesterId,
    region: '양평',
    category: 'RESIDENTIAL',
    title: '30평 아파트 전체 리모델링',
    description: '주방·욕실 포함 전체',
    siteAddress: '양평군 어딘가',
  });
}

describe('InteriorStore — 밀봉 입찰 가시성 (업체끼리 비공개, 소비자만 전체)', () => {
  it('업체는 자기 입찰만 보고, 경쟁사 입찰은 못 본다', () => {
    const store = setup();
    const r = createRequest(store);
    store.submitBid({ requestId: r.id, providerId: 'biz-A', amount: 20_000_000 });
    store.submitBid({ requestId: r.id, providerId: 'biz-B', amount: 18_000_000 });

    const asA = store.listBids(r.id, 'biz-A');
    expect(asA).toHaveLength(1);
    expect(asA[0]?.providerId).toBe('biz-A');
    // 경쟁사(B) 금액이 A에게 절대 새지 않아야 한다.
    expect(asA.some((b) => b.providerId === 'biz-B')).toBe(false);
  });

  it('요청자(소비자)는 모든 입찰을 본다', () => {
    const store = setup();
    const r = createRequest(store);
    store.submitBid({ requestId: r.id, providerId: 'biz-A', amount: 20_000_000 });
    store.submitBid({ requestId: r.id, providerId: 'biz-B', amount: 18_000_000 });

    const asConsumer = store.listBids(r.id, 'consumer-1');
    expect(asConsumer).toHaveLength(2);
    expect(asConsumer.map((b) => b.providerId).sort()).toEqual(['biz-A', 'biz-B']);
  });

  it('입찰하지 않은 제3의 업체는 아무 것도 못 본다', () => {
    const store = setup();
    const r = createRequest(store);
    store.submitBid({ requestId: r.id, providerId: 'biz-A', amount: 20_000_000 });
    expect(store.listBids(r.id, 'biz-outsider')).toHaveLength(0);
  });

  it('없는 요청 조회는 존재 여부를 흘리지 않고 빈 목록', () => {
    const store = setup();
    expect(store.listBids('nope', 'consumer-1')).toHaveLength(0);
  });
});

describe('InteriorStore.submitBid — 입찰 검증', () => {
  it('본인 요청에는 입찰 불가', () => {
    const store = setup();
    const r = createRequest(store, 'consumer-1');
    expect(() =>
      store.submitBid({ requestId: r.id, providerId: 'consumer-1', amount: 1_000_000 }),
    ).toThrow('본인 요청에는 입찰할 수 없습니다.');
  });

  it('0원 이하·소수점 입찰 거부', () => {
    const store = setup();
    const r = createRequest(store);
    for (const amount of [0, -1, 1000.5]) {
      expect(() =>
        store.submitBid({ requestId: r.id, providerId: 'biz-A', amount }),
      ).toThrow(InteriorValidationError);
    }
  });

  it('매칭 확정된 요청에는 입찰 불가', () => {
    const store = setup();
    const r = createRequest(store);
    store.submitBid({ requestId: r.id, providerId: 'biz-A', amount: 20_000_000 });
    const bid = store.listBids(r.id, 'consumer-1')[0]!;
    store.acceptBid(bid.id, 'consumer-1');
    expect(() =>
      store.submitBid({ requestId: r.id, providerId: 'biz-B', amount: 15_000_000 }),
    ).toThrow('매칭 대기중(REQUESTED) 요청에만 입찰할 수 있습니다.');
  });
});

describe('InteriorStore.acceptBid — 낙찰 (단일 낙찰 + 매칭 확정)', () => {
  it('소비자가 낙찰하면 그 업체로 MATCHED, 낙찰가가 agreedFee', () => {
    const store = setup();
    const r = createRequest(store);
    store.submitBid({ requestId: r.id, providerId: 'biz-A', amount: 20_000_000 });
    store.submitBid({ requestId: r.id, providerId: 'biz-B', amount: 18_000_000 });
    const bids = store.listBids(r.id, 'consumer-1');
    const chosen = bids.find((b) => b.providerId === 'biz-B')!;

    const accepted = store.acceptBid(chosen.id, 'consumer-1');
    expect(accepted.status).toBe('ACCEPTED');

    const updated = store.getRequest(r.id)!;
    expect(updated.status).toBe('MATCHED');
    expect(updated.matchedProviderId).toBe('biz-B');
    expect(updated.matchedBidId).toBe(chosen.id);
    expect(updated.agreedFee).toBe(18_000_000);

    // 나머지 입찰은 자동 미선정(REJECTED).
    const others = store.listBids(r.id, 'consumer-1').filter((b) => b.id !== chosen.id);
    expect(others.every((b) => b.status === 'REJECTED')).toBe(true);
  });

  it('요청자 본인이 아니면 낙찰 불가', () => {
    const store = setup();
    const r = createRequest(store);
    store.submitBid({ requestId: r.id, providerId: 'biz-A', amount: 20_000_000 });
    const bid = store.listBids(r.id, 'consumer-1')[0]!;
    expect(() => store.acceptBid(bid.id, 'biz-A')).toThrow('본인 요청의 입찰만 낙찰할 수 있습니다.');
  });

  it('이미 낙찰된 요청은 재낙찰 불가', () => {
    const store = setup();
    const r = createRequest(store);
    store.submitBid({ requestId: r.id, providerId: 'biz-A', amount: 20_000_000 });
    store.submitBid({ requestId: r.id, providerId: 'biz-B', amount: 18_000_000 });
    const bids = store.listBids(r.id, 'consumer-1');
    store.acceptBid(bids[0]!.id, 'consumer-1');
    expect(() => store.acceptBid(bids[1]!.id, 'consumer-1')).toThrow('이미 매칭이 확정된 요청입니다.');
  });
});
