import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import { LocationStore, LocationValidationError } from './store.js';

const point = { lat: 37.49, lng: 127.49 };

function setup(status: 'REQUESTED' | 'IN_PROGRESS' = 'IN_PROGRESS') {
  const requestStore = new RequestStore();
  const store = new LocationStore(requestStore);
  const request = requestStore.create({
    kind: 'TRANSPORT',
    requesterId: 'd-1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 7,
    allbaroRequested: false,
    loadAddress: '양평군 상차지',
    unloadAddress: '양평군 하차지',
  });
  if (status === 'IN_PROGRESS') {
    requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p-1' });
    requestStore.changeStatus(request.id, 'PAID');
    requestStore.changeStatus(request.id, 'IN_PROGRESS');
  }
  return { requestStore, store, request };
}

describe('LocationStore — 실시간 위치 공유', () => {
  it('진행중 요청의 매칭 업체만 위치 갱신, 최신 위치 조회', () => {
    const { store, request } = setup();
    store.updateLocation(request.id, 'p-1', point);
    const moved = { lat: 37.5, lng: 127.5 };
    store.updateLocation(request.id, 'p-1', moved);

    const share = store.getLocation(request.id);
    expect(share?.location).toEqual(moved);
    expect(share?.providerId).toBe('p-1');
  });

  it('작업 시작 전(IN_PROGRESS 아님)에는 공유 불가', () => {
    const { store, request } = setup('REQUESTED');
    expect(() => store.updateLocation(request.id, 'p-1', point)).toThrow(
      LocationValidationError,
    );
  });

  it('매칭 업체가 아니면 갱신 거부', () => {
    const { store, request } = setup();
    expect(() => store.updateLocation(request.id, '다른업체', point)).toThrow(
      '매칭 확정된 업체만',
    );
  });

  it('잘못된 좌표 거부', () => {
    const { store, request } = setup();
    expect(() => store.updateLocation(request.id, 'p-1', { lat: 91, lng: 0 })).toThrow(
      LocationValidationError,
    );
  });

  it('작업 완료 후에는 공유 종료 (null, 저장된 위치 폐기)', () => {
    const { requestStore, store, request } = setup();
    store.updateLocation(request.id, 'p-1', point);
    requestStore.changeStatus(request.id, 'COMPLETED');
    expect(store.getLocation(request.id)).toBeNull();
  });

  it('없는 요청 조회는 오류, 위치 미보고 진행 건은 null', () => {
    const { store, request } = setup();
    expect(() => store.getLocation('nope')).toThrow('요청을 찾을 수 없습니다.');
    expect(store.getLocation(request.id)).toBeNull();
  });
});
