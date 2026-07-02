import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import { OfferStore, OfferValidationError } from './store.js';

function setup(startAt = new Date('2026-07-03T09:00:00+09:00')) {
  const requestStore = new RequestStore();
  let current = startAt;
  const clock = {
    advanceMinutes(min: number) {
      current = new Date(current.getTime() + min * 60_000);
    },
  };
  const store = new OfferStore(requestStore, undefined, () => current);
  const request = requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'd-1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 7,
    allbaroRequested: false,
    siteAddress: '양평군 현장',
  });
  return { requestStore, store, request, clock };
}

describe('OfferStore — 제안·응답', () => {
  it('수락하면 요청이 MATCHED 로 전이되고 업체가 확정된다', () => {
    const { requestStore, store, request } = setup();
    const offer = store.createOffer({ requestId: request.id, providerId: 'p-1' });
    expect(offer.status).toBe('OFFERED');

    const accepted = store.respond(offer.id, 'ACCEPT');
    expect(accepted.status).toBe('ACCEPTED');
    const updated = requestStore.get(request.id);
    expect(updated?.status).toBe('MATCHED');
    expect(updated?.matchedProviderId).toBe('p-1');
  });

  it('요청당 활성 제안은 1건 — 응답 대기중 중복 제안 거부', () => {
    const { store, request } = setup();
    store.createOffer({ requestId: request.id, providerId: 'p-1' });
    expect(() => store.createOffer({ requestId: request.id, providerId: 'p-2' })).toThrow(
      OfferValidationError,
    );
  });

  it('거절하면 요청은 REQUESTED 로 남고 다음 후보에게 제안 가능', () => {
    const { requestStore, store, request } = setup();
    const offer = store.createOffer({ requestId: request.id, providerId: 'p-1' });
    store.respond(offer.id, 'DECLINE');
    expect(requestStore.get(request.id)?.status).toBe('REQUESTED');

    const next = store.createOffer({ requestId: request.id, providerId: 'p-2' });
    expect(next.status).toBe('OFFERED');
    // 이미 거절한 업체에는 재제안하지 않는다.
    expect(() => store.createOffer({ requestId: request.id, providerId: 'p-1' })).toThrow(
      OfferValidationError,
    );
  });
});

describe('OfferStore — 타임아웃/재매칭 (지연 스윕)', () => {
  it('제한 시간(기본 30분) 무응답이면 만료되고 늦은 수락은 거부된다', () => {
    const { requestStore, store, request, clock } = setup();
    const offer = store.createOffer({ requestId: request.id, providerId: 'p-1' });

    clock.advanceMinutes(31);
    expect(() => store.respond(offer.id, 'ACCEPT')).toThrow('응답 시간이 지난 제안입니다');
    expect(store.get(offer.id)?.status).toBe('EXPIRED');
    expect(requestStore.get(request.id)?.status).toBe('REQUESTED');
  });

  it('sweepExpired 는 이번에 만료된 오퍼를 돌려준다 (재매칭 트리거용)', () => {
    const { store, request, clock } = setup();
    store.createOffer({ requestId: request.id, providerId: 'p-1', ttlMinutes: 10 });

    clock.advanceMinutes(9);
    expect(store.sweepExpired()).toHaveLength(0);
    clock.advanceMinutes(2);
    const expired = store.sweepExpired();
    expect(expired).toHaveLength(1);
    expect(expired[0].requestId).toBe(request.id);
    // 두 번째 스윕에서는 다시 나오지 않는다.
    expect(store.sweepExpired()).toHaveLength(0);
  });

  it('만료 후 다음 후보 제안 → 수락 재매칭 플로우', () => {
    const { requestStore, store, request, clock } = setup();
    store.createOffer({ requestId: request.id, providerId: 'p-1', ttlMinutes: 10 });
    clock.advanceMinutes(11);

    const next = store.createOffer({ requestId: request.id, providerId: 'p-2', ttlMinutes: 10 });
    store.respond(next.id, 'ACCEPT');
    expect(requestStore.get(request.id)?.matchedProviderId).toBe('p-2');
  });

  it('ttlMinutes 0 이하 거부, 없는 요청/제안 거부', () => {
    const { store, request } = setup();
    expect(() =>
      store.createOffer({ requestId: request.id, providerId: 'p-1', ttlMinutes: 0 }),
    ).toThrow(OfferValidationError);
    expect(() => store.createOffer({ requestId: 'nope', providerId: 'p-1' })).toThrow(
      '요청을 찾을 수 없습니다.',
    );
    expect(() => store.respond('nope', 'ACCEPT')).toThrow('제안을 찾을 수 없습니다.');
  });
});
