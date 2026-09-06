import type { AppNotification } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import type { NotificationProvider } from './provider.js';
import { NotificationService } from './service.js';

async function setup(provider?: NotificationProvider) {
  const sent: AppNotification[] = [];
  const service = new NotificationService(provider ?? { send: (n) => sent.push(n) });
  const requestStore = new RequestStore(undefined, (request) => {
    service.notifyStatusChange(request);
  });
  const request = await requestStore.create({
    kind: 'DEMOLITION',
    requesterId: 'd-1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteTons: 7,
    allbaroRequested: false,
    siteAddress: '양평군 현장',
  });
  return { service, requestStore, request, sent };
}

describe('NotificationService — 매칭 단계별 알림', () => {
  it('매칭 확정 시 배출자·업체 모두에게 한글 알림 발송', async () => {
    const { requestStore, request, sent } = await setup();
    await requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p-1' });

    expect(sent).toHaveLength(2);
    const toRequester = sent.find((n) => n.userId === 'd-1');
    const toProvider = sent.find((n) => n.userId === 'p-1');
    expect(toRequester?.message).toContain('결제를 진행');
    expect(toProvider?.message).toContain('새 작업이 매칭');
    expect(toRequester?.status).toBe('MATCHED');
  });

  it('정산완료(SETTLED)는 업체에게만 발송', async () => {
    const { requestStore, request, sent } = await setup();
    await requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p-1' });
    await requestStore.changeStatus(request.id, 'PAID');
    await requestStore.changeStatus(request.id, 'IN_PROGRESS');
    await requestStore.changeStatus(request.id, 'COMPLETED');
    sent.length = 0;

    await requestStore.changeStatus(request.id, 'SETTLED');
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('p-1');
    expect(sent[0].message).toContain('정산이 완료');
  });

  it('매칭 전 취소는 배출자에게만 (업체 미확정)', async () => {
    const { requestStore, request, sent } = await setup();
    await requestStore.changeStatus(request.id, 'CANCELLED', { cancelReason: '일정 변경' });
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('d-1');
  });

  it('알림함 목록: 수신자별 필터·최신순', async () => {
    const { service, requestStore, request } = await setup();
    await requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p-1' });
    await requestStore.changeStatus(request.id, 'PAID');

    expect(service.list({ userId: 'd-1' })).toHaveLength(2);
    expect(service.list({ userId: 'p-1' })).toHaveLength(2);
    expect(service.list({ requestId: request.id })).toHaveLength(4);
    expect(service.list({ userId: '외부인' })).toHaveLength(0);
  });

  it('발송 실패(어댑터 예외)해도 상태 전이와 알림함 기록은 유지', async () => {
    const { service, requestStore, request } = await setup({
      send: () => {
        throw new Error('푸시 서버 장애');
      },
    });
    const updated = await requestStore.changeStatus(request.id, 'MATCHED', {
      matchedProviderId: 'p-1',
    });
    expect(updated.status).toBe('MATCHED');
    expect(service.list({ requestId: request.id })).toHaveLength(2);
  });
});

describe('NotificationService — 신규 운반요청 콜 알림(반경 30km)', () => {
  function transportSetup() {
    const sent: AppNotification[] = [];
    const service = new NotificationService({ send: (n) => sent.push(n) });
    const requestStore = new RequestStore(undefined, undefined, (request) => {
      service.notifyTransportCall(request, [
        { id: 't-here', location: { lat: 37.5, lng: 127.5 } }, // 0km
        { id: 't-near', location: { lat: 37.6, lng: 127.5 } }, // ~11km (반경 내)
        { id: 't-far', location: { lat: 37.9, lng: 127.5 } }, // ~44km (반경 밖)
        { id: 't-noloc' }, // 좌표 없음
      ]);
    });
    return { service, requestStore, sent };
  }

  function createTransport(requestStore: RequestStore, location?: { lat: number; lng: number }) {
    return requestStore.create({
      kind: 'TRANSPORT',
      requesterId: 'demo-1',
      region: '양평',
      wasteCategory: 'CONSTRUCTION',
      wasteTons: 6,
      allbaroRequested: false,
      loadAddress: '양평군 상차지',
      unloadAddress: '양평군 하차지',
      location,
    });
  }

  it('현장 좌표가 있으면 반경 30km 이내 운반업체에게만 콜 발송(좌표 없는 업체 제외)', async () => {
    const { requestStore, sent } = transportSetup();
    await createTransport(requestStore, { lat: 37.5, lng: 127.5 });

    const ids = sent.map((n) => n.userId).sort();
    expect(ids).toEqual(['t-here', 't-near']);
    expect(sent[0].status).toBe('REQUESTED');
    expect(sent[0].message).toContain('운반 콜');
  });

  it('현장 좌표가 없으면 반경 판단 불가 → 전달된 후보 전체에 콜 발송', async () => {
    const { requestStore, sent } = transportSetup();
    await createTransport(requestStore);

    expect(sent.map((n) => n.userId).sort()).toEqual(['t-far', 't-here', 't-near', 't-noloc']);
  });

  it('운반요청이 아닌 신규 요청에는 콜을 보내지 않는다', async () => {
    const sent: AppNotification[] = [];
    const service = new NotificationService({ send: (n) => sent.push(n) });
    const requestStore = new RequestStore(undefined, undefined, (request) => {
      service.notifyTransportCall(request, [{ id: 't-here', location: { lat: 37.5, lng: 127.5 } }]);
    });
    await requestStore.create({
      kind: 'DEMOLITION',
      requesterId: 'c-1',
      region: '양평',
      wasteCategory: 'CONSTRUCTION',
      wasteTons: 7,
      allbaroRequested: false,
      siteAddress: '양평군 현장',
      location: { lat: 37.5, lng: 127.5 },
    });
    expect(sent).toHaveLength(0);
  });
});
