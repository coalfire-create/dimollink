import { describe, expect, it } from 'vitest';
import { PLATFORM_FEE_RATE } from '@dimol/shared';
import { calculateSettlement } from './calculate.js';

describe('calculateSettlement', () => {
  it('수수료 7%를 적용하고 지급액 합계가 정산 총액과 일치한다', () => {
    const result = calculateSettlement({ transportFee: 100_000, disposalFee: 50_000 });

    expect(result.grossAmount).toBe(150_000);
    expect(result.platformFee).toBe(10_500); // 150,000 * 0.07
    expect(result.totalPayout).toBe(139_500);
    expect(result.payoutToTransport).toBe(93_000);
    expect(result.payoutToDisposal).toBe(46_500);
    expect(result.payoutToTransport + result.payoutToDisposal).toBe(result.totalPayout);
  });

  it('수수료율은 shared 상수(7%)를 그대로 반영한다', () => {
    expect(PLATFORM_FEE_RATE).toBe(0.07);
    const { grossAmount, platformFee } = calculateSettlement({
      transportFee: 1_000_000,
      disposalFee: 0,
    });
    expect(platformFee).toBe(Math.round(grossAmount * 0.07));
  });

  it('반올림 오차가 있어도 지급액 합계 == 정산 총액 불변식이 유지된다', () => {
    const result = calculateSettlement({ transportFee: 33_333, disposalFee: 33_334 });
    expect(result.payoutToTransport + result.payoutToDisposal).toBe(result.totalPayout);
  });

  it('금액이 0이면 모든 결과가 0이다', () => {
    const result = calculateSettlement({ transportFee: 0, disposalFee: 0 });
    expect(result.totalPayout).toBe(0);
    expect(result.platformFee).toBe(0);
    expect(result.payoutToTransport).toBe(0);
    expect(result.payoutToDisposal).toBe(0);
  });

  it('음수 금액은 거부한다', () => {
    expect(() => calculateSettlement({ transportFee: -1, disposalFee: 0 })).toThrow();
  });
});
