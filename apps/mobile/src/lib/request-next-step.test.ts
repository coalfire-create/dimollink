import { describe, expect, it } from 'vitest';
import type { MatchStatus, ServiceRequest } from '@dimol/shared';
import { payableAmount, requesterNextStep } from './request-next-step';

const base = {
  id: 'r1',
  requesterId: 'u1',
  region: '경기 양평군',
  wasteCategory: 'CONSTRUCTION',
  wasteItems: [],
  wasteTons: 0,
  sitePhotoKeys: [],
  allbaroRequested: false,
  createdAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
};

const demolition = (status: MatchStatus, agreedFee?: number) =>
  ({ ...base, kind: 'DEMOLITION', siteAddress: '양평읍 1', status, agreedFee }) as ServiceRequest;

const transport = (status: MatchStatus) =>
  ({ ...base, kind: 'TRANSPORT', loadAddress: 'A', unloadAddress: 'B', status }) as ServiceRequest;

describe('payableAmount', () => {
  it('선결제 — 매칭 확정 건은 합의 금액 전액을 결제한다(계약금·잔금으로 나누지 않는다)', () => {
    expect(payableAmount(demolition('MATCHED', 3_000_000))).toBe(3_000_000);
  });

  it('금액이 아직 없거나 0이면 결제할 수 없다', () => {
    expect(payableAmount(demolition('MATCHED'))).toBeNull();
    expect(payableAmount(demolition('MATCHED', 0))).toBeNull();
  });

  it('이미 결제했거나 끝난 건은 다시 결제하지 않는다', () => {
    for (const status of [
      'REQUESTED',
      'PAID',
      'IN_PROGRESS',
      'COMPLETED',
      'SETTLED',
      'CANCELLED',
    ] as const) {
      expect(payableAmount(demolition(status, 3_000_000))).toBeNull();
    }
  });
});

describe('requesterNextStep', () => {
  it('결제할 차례면 결제를 앞세우고 강조한다', () => {
    const step = requesterNextStep(demolition('MATCHED', 1_000_000));
    expect(step.action).toBe('PAY');
    expect(step.needsAttention).toBe(true);
  });

  it('금액 확정 전 매칭은 결제 버튼을 내지 않는다', () => {
    expect(requesterNextStep(demolition('MATCHED')).action).toBe('DETAIL');
  });

  it('철거 견적 대기 중에는 받은 견적으로 안내한다', () => {
    expect(requesterNextStep(demolition('REQUESTED')).action).toBe('VIEW_ESTIMATES');
  });

  it('차량 위치는 운반 건에만 있다', () => {
    expect(requesterNextStep(transport('IN_PROGRESS')).action).toBe('TRACK');
    expect(requesterNextStep(demolition('IN_PROGRESS')).action).toBe('DETAIL');
  });

  it('끝난 건은 후기로 안내한다', () => {
    expect(requesterNextStep(demolition('COMPLETED')).action).toBe('REVIEW');
    expect(requesterNextStep(demolition('SETTLED')).action).toBe('REVIEW');
  });
});
