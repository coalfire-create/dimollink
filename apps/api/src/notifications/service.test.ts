import type { AppNotification } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { RequestStore } from '../requests/store.js';
import type { NotificationProvider } from './provider.js';
import { NotificationService } from './service.js';

function setup(provider?: NotificationProvider) {
  const sent: AppNotification[] = [];
  const service = new NotificationService(
    provider ?? { send: (n) => sent.push(n) },
  );
  const requestStore = new RequestStore(undefined, (request) =>
    service.notifyStatusChange(request),
  );
  const request = requestStore.create({
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
  it('매칭 확정 시 배출자·업체 모두에게 한글 알림 발송', () => {
    const { requestStore, request, sent } = setup();
    requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p-1' });

    expect(sent).toHaveLength(2);
    const toRequester = sent.find((n) => n.userId === 'd-1');
    const toProvider = sent.find((n) => n.userId === 'p-1');
    expect(toRequester?.message).toContain('결제를 진행');
    expect(toProvider?.message).toContain('새 작업이 매칭');
    expect(toRequester?.status).toBe('MATCHED');
  });

  it('정산완료(SETTLED)는 업체에게만 발송', () => {
    const { requestStore, request, sent } = setup();
    requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p-1' });
    requestStore.changeStatus(request.id, 'PAID');
    requestStore.changeStatus(request.id, 'IN_PROGRESS');
    requestStore.changeStatus(request.id, 'COMPLETED');
    sent.length = 0;

    requestStore.changeStatus(request.id, 'SETTLED');
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('p-1');
    expect(sent[0].message).toContain('정산이 완료');
  });

  it('매칭 전 취소는 배출자에게만 (업체 미확정)', () => {
    const { requestStore, request, sent } = setup();
    requestStore.changeStatus(request.id, 'CANCELLED', { cancelReason: '일정 변경' });
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe('d-1');
  });

  it('알림함 목록: 수신자별 필터·최신순', () => {
    const { service, requestStore, request } = setup();
    requestStore.changeStatus(request.id, 'MATCHED', { matchedProviderId: 'p-1' });
    requestStore.changeStatus(request.id, 'PAID');

    expect(service.list({ userId: 'd-1' })).toHaveLength(2);
    expect(service.list({ userId: 'p-1' })).toHaveLength(2);
    expect(service.list({ requestId: request.id })).toHaveLength(4);
    expect(service.list({ userId: '외부인' })).toHaveLength(0);
  });

  it('발송 실패(어댑터 예외)해도 상태 전이와 알림함 기록은 유지', () => {
    const { service, requestStore, request } = setup({
      send: () => {
        throw new Error('푸시 서버 장애');
      },
    });
    const updated = requestStore.changeStatus(request.id, 'MATCHED', {
      matchedProviderId: 'p-1',
    });
    expect(updated.status).toBe('MATCHED');
    expect(service.list({ requestId: request.id })).toHaveLength(2);
  });
});
