import { canViewRequest, type ServiceRequest, type UserType } from '@dimol/shared';
import { describe, expect, it } from 'vitest';

/**
 * 요청 상세 읽기 권한 — 누가 남의 현장 정보를 볼 수 있는지를 정하는 규칙이라
 * 테스트로 고정한다. 현장 주소·사진·건축물대장은 전부 PII 에 준해 다룬다.
 */

const REQUESTER = 'consumer-1';
const MATCHED = 'demo-matched';
const OTHER_DEMO = 'demo-other';
const TRANSPORT = 'transport-1';

function demolitionRequest(over: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: 'req-1',
    kind: 'DEMOLITION',
    requesterId: REQUESTER,
    region: '서울 마포구',
    wasteCategory: 'CONSTRUCTION',
    wasteItems: [{ material: 'REINFORCED_CONCRETE', kg: 10_000 }],
    wasteTons: 10,
    allbaroRequested: false,
    sitePhotoKeys: [],
    status: 'REQUESTED',
    siteAddress: '서울 마포구 양화로 45',
    createdAt: '2026-09-15T00:00:00.000Z',
    updatedAt: '2026-09-15T00:00:00.000Z',
    ...over,
  } as ServiceRequest;
}

const viewer = (id: string, userType: UserType) => ({ id, userType });

describe('canViewRequest', () => {
  it('요청자는 언제나 본다', () => {
    for (const status of ['REQUESTED', 'MATCHED', 'COMPLETED'] as const) {
      expect(canViewRequest(demolitionRequest({ status }), viewer(REQUESTER, 'CONSUMER'))).toBe(
        true,
      );
    }
  });

  it('매칭된 업체는 진행 중에도 본다', () => {
    const request = demolitionRequest({ status: 'MATCHED', matchedProviderId: MATCHED });
    expect(canViewRequest(request, viewer(MATCHED, 'DEMOLITION_COMPANY'))).toBe(true);
  });

  it('아직 수주 전인 요청은 같은 유형의 업체가 볼 수 있다 — 견적을 내려면 봐야 한다', () => {
    const request = demolitionRequest({ status: 'REQUESTED' });
    expect(canViewRequest(request, viewer(OTHER_DEMO, 'DEMOLITION_COMPANY'))).toBe(true);
  });

  it('수주가 끝나면 떨어진 업체는 더 이상 못 본다', () => {
    const request = demolitionRequest({ status: 'MATCHED', matchedProviderId: MATCHED });
    expect(canViewRequest(request, viewer(OTHER_DEMO, 'DEMOLITION_COMPANY'))).toBe(false);
  });

  it('유형이 다른 업체는 못 본다 — 운반업체에게 철거 요청은 자기 일감이 아니다', () => {
    const request = demolitionRequest({ status: 'REQUESTED' });
    expect(canViewRequest(request, viewer(TRANSPORT, 'TRANSPORT_COMPANY'))).toBe(false);
  });

  it('다른 소비자는 못 본다', () => {
    const request = demolitionRequest({ status: 'REQUESTED' });
    expect(canViewRequest(request, viewer('consumer-2', 'CONSUMER'))).toBe(false);
  });

  it('취소된 요청은 관계자만 본다', () => {
    const request = demolitionRequest({ status: 'CANCELLED' });
    expect(canViewRequest(request, viewer(OTHER_DEMO, 'DEMOLITION_COMPANY'))).toBe(false);
    expect(canViewRequest(request, viewer(REQUESTER, 'CONSUMER'))).toBe(true);
  });

  it('운반 요청은 운반업체가, 철거 요청은 철거업체가 본다', () => {
    const transportRequest = {
      ...demolitionRequest(),
      kind: 'TRANSPORT',
      loadAddress: 'A',
      unloadAddress: 'B',
    } as unknown as ServiceRequest;
    expect(canViewRequest(transportRequest, viewer(TRANSPORT, 'TRANSPORT_COMPANY'))).toBe(true);
    expect(canViewRequest(transportRequest, viewer(OTHER_DEMO, 'DEMOLITION_COMPANY'))).toBe(false);
  });
});
