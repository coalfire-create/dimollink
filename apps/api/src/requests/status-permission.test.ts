import type { MatchStatus, ServiceRequest } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { checkParticipantStatusChange } from './status-permission.js';

const request = (status: MatchStatus): ServiceRequest =>
  ({
    id: 'r1',
    kind: 'TRANSPORT',
    requesterId: 'consumer',
    matchedProviderId: 'provider',
    status,
  }) as ServiceRequest;

describe('checkParticipantStatusChange', () => {
  it('업체가 결제 없이 결제완료(PAID)로 바꿀 수 없다', () => {
    expect(checkParticipantStatusChange(request('MATCHED'), 'provider', 'PAID')?.httpStatus).toBe(
      403,
    );
  });

  it('정산완료(SETTLED)·매칭(MATCHED)도 이 경로로는 못 바꾼다', () => {
    expect(
      checkParticipantStatusChange(request('COMPLETED'), 'provider', 'SETTLED'),
    ).not.toBeNull();
    expect(
      checkParticipantStatusChange(request('REQUESTED'), 'consumer', 'MATCHED'),
    ).not.toBeNull();
  });

  it('결제가 끝난 요청은 일반 취소 대신 환불로 — 돈이 묶이지 않게', () => {
    const denied = checkParticipantStatusChange(request('PAID'), 'consumer', 'CANCELLED');
    expect(denied?.code).toBe('USE_REFUND');
  });

  it('결제 전 취소는 허용', () => {
    expect(checkParticipantStatusChange(request('REQUESTED'), 'consumer', 'CANCELLED')).toBeNull();
    expect(checkParticipantStatusChange(request('MATCHED'), 'consumer', 'CANCELLED')).toBeNull();
  });

  it('작업 시작·완료는 매칭 업체만', () => {
    expect(checkParticipantStatusChange(request('PAID'), 'provider', 'IN_PROGRESS')).toBeNull();
    expect(
      checkParticipantStatusChange(request('IN_PROGRESS'), 'provider', 'COMPLETED'),
    ).toBeNull();
    expect(
      checkParticipantStatusChange(request('IN_PROGRESS'), 'consumer', 'COMPLETED')?.httpStatus,
    ).toBe(403);
  });
});
