import { CANCELLATION_PENALTY_RATE } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import {
  CancellationNotAllowedError,
  assertCancellable,
  calculateRefund,
  effectiveCancellationStage,
} from './refund.js';

describe('calculateRefund', () => {
  it('배차 전 → 전액 환불, 위약금 0', () => {
    const r = calculateRefund({ paidAmount: 150_000, stage: 'BEFORE_DISPATCH' });
    expect(r.cancellable).toBe(true);
    expect(r.penaltyAmount).toBe(0);
    expect(r.refundAmount).toBe(150_000);
  });

  it('배차 후 → 위약금 10% 공제 후 환불', () => {
    const r = calculateRefund({ paidAmount: 150_000, stage: 'AFTER_DISPATCH' });
    expect(r.cancellable).toBe(true);
    expect(r.penaltyAmount).toBe(15_000); // 150,000 * 0.1
    expect(r.refundAmount).toBe(135_000);
  });

  it('작업 시작 후 → 취소 불가, 환불 0', () => {
    const r = calculateRefund({ paidAmount: 150_000, stage: 'AFTER_WORK_START' });
    expect(r.cancellable).toBe(false);
    expect(r.penaltyAmount).toBe(0);
    expect(r.refundAmount).toBe(0);
  });

  it('위약금율은 shared 상수(10%)를 그대로 반영', () => {
    expect(CANCELLATION_PENALTY_RATE).toBe(0.1);
    const { paidAmount, penaltyAmount } = calculateRefund({
      paidAmount: 1_000_000,
      stage: 'AFTER_DISPATCH',
    });
    expect(penaltyAmount).toBe(Math.round(paidAmount * 0.1));
  });

  it('환불액 + 위약금 == 원금 불변식 (반올림 포함)', () => {
    for (const paidAmount of [0, 1, 33_333, 99_999, 150_005]) {
      const r = calculateRefund({ paidAmount, stage: 'AFTER_DISPATCH' });
      expect(r.refundAmount + r.penaltyAmount).toBe(paidAmount);
    }
  });

  it('원금 0이면 모든 단계에서 환불/위약금 0', () => {
    expect(calculateRefund({ paidAmount: 0, stage: 'BEFORE_DISPATCH' }).refundAmount).toBe(0);
    expect(calculateRefund({ paidAmount: 0, stage: 'AFTER_DISPATCH' }).penaltyAmount).toBe(0);
  });

  it('음수/비정수 원금은 거부', () => {
    expect(() => calculateRefund({ paidAmount: -1, stage: 'BEFORE_DISPATCH' })).toThrow();
    expect(() => calculateRefund({ paidAmount: 1.5, stage: 'BEFORE_DISPATCH' })).toThrow();
  });
});

describe('assertCancellable', () => {
  it('취소 가능 단계는 통과', () => {
    const r = calculateRefund({ paidAmount: 100, stage: 'BEFORE_DISPATCH' });
    expect(() => assertCancellable(r)).not.toThrow();
  });

  it('작업 시작 후는 CancellationNotAllowedError', () => {
    const r = calculateRefund({ paidAmount: 100, stage: 'AFTER_WORK_START' });
    expect(() => assertCancellable(r)).toThrow(CancellationNotAllowedError);
  });
});

describe('effectiveCancellationStage — 클라이언트가 단계를 낮춰 보낼 수 없다', () => {
  it('작업이 시작된 건은 앱이 "배차 전"이라고 보내도 취소 불가 단계가 된다', () => {
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'SETTLED'] as const) {
      expect(effectiveCancellationStage('BEFORE_DISPATCH', status)).toBe('AFTER_WORK_START');
      expect(effectiveCancellationStage('AFTER_DISPATCH', status)).toBe('AFTER_WORK_START');
    }
  });

  it('작업 전이면 클라이언트 단계를 따른다(더 엄격한 배차 후 신고도 존중)', () => {
    expect(effectiveCancellationStage('BEFORE_DISPATCH', 'PAID')).toBe('BEFORE_DISPATCH');
    expect(effectiveCancellationStage('AFTER_DISPATCH', 'PAID')).toBe('AFTER_DISPATCH');
    expect(effectiveCancellationStage('AFTER_WORK_START', 'PAID')).toBe('AFTER_WORK_START');
  });

  it('요청을 못 찾으면 클라이언트 단계를 그대로 쓴다', () => {
    expect(effectiveCancellationStage('BEFORE_DISPATCH', undefined)).toBe('BEFORE_DISPATCH');
  });

  it('작업 시작 후 단계의 환불액은 0 — 낮춰 보낸 단계로 전액이 나가지 않는다', () => {
    const stage = effectiveCancellationStage('BEFORE_DISPATCH', 'IN_PROGRESS');
    expect(calculateRefund({ paidAmount: 1_000_000, stage }).refundAmount).toBe(0);
  });
});
