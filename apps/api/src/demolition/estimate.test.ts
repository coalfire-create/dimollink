import { describe, expect, it } from 'vitest';
import {
  MAX_PRELIMINARY_SPREAD_RATIO,
  MAX_SITE_VISITS_PER_REQUEST,
  canScheduleMoreVisits,
  countScheduledVisits,
  estimateDeviation,
  exceedsPreliminary,
  providerEstimateAccuracy,
  validateFinalEstimate,
  validatePreliminaryRange,
  visibleDemolitionEstimates,
  type DemolitionEstimate,
} from '@dimol/shared';

/**
 * 철거 견적 규칙 — 여기서 정하는 것이 곧 "저가후려치기를 막는 장치"라 경계를 못 박는다.
 */

function estimate(over: Partial<DemolitionEstimate> = {}): DemolitionEstimate {
  return {
    id: 'e1',
    requestId: 'r1',
    providerId: 'p1',
    stage: 'PRELIMINARY',
    preliminary: { minAmount: 8_000_000, maxAmount: 12_000_000, createdAt: '2026-09-01' },
    createdAt: '2026-09-01',
    ...over,
  };
}

describe('개산 범위 검증', () => {
  it('정상 범위는 통과', () => {
    expect(validatePreliminaryRange(8_000_000, 12_000_000).ok).toBe(true);
  });

  it('상단이 하단보다 작으면 거부', () => {
    expect(validatePreliminaryRange(12_000_000, 8_000_000).ok).toBe(false);
  });

  it('0·음수·소수는 거부', () => {
    for (const [min, max] of [
      [0, 100],
      [-1, 100],
      [100, 0],
      [1.5, 100],
    ]) {
      expect(validatePreliminaryRange(min, max).ok).toBe(false);
    }
  });

  it('너무 넓은 범위는 거부 — 정보가 없는 것과 같다', () => {
    const min = 1_000_000;
    expect(validatePreliminaryRange(min, min * MAX_PRELIMINARY_SPREAD_RATIO).ok).toBe(true);
    expect(validatePreliminaryRange(min, min * MAX_PRELIMINARY_SPREAD_RATIO + 1).ok).toBe(false);
  });

  it('좁은 범위는 허용한다 — 확신 있는 업체를 막을 이유가 없다', () => {
    expect(validatePreliminaryRange(10_000_000, 10_000_000).ok).toBe(true);
  });
});

describe('확정 견적 — 개산 초과 시 사유 강제', () => {
  it('개산 안이면 사유 없이 통과', () => {
    expect(validateFinalEstimate(estimate(), 11_000_000, undefined).ok).toBe(true);
  });

  it('개산 상단과 같으면 초과가 아니다', () => {
    expect(exceedsPreliminary(estimate(), 12_000_000)).toBe(false);
    expect(validateFinalEstimate(estimate(), 12_000_000, undefined).ok).toBe(true);
  });

  it('상단을 1원이라도 넘으면 사유가 필요하다', () => {
    expect(exceedsPreliminary(estimate(), 12_000_001)).toBe(true);
    expect(validateFinalEstimate(estimate(), 12_000_001, undefined).ok).toBe(false);
    expect(validateFinalEstimate(estimate(), 12_000_001, '   ').ok).toBe(false);
    expect(validateFinalEstimate(estimate(), 12_000_001, '지하 정화조 발견').ok).toBe(true);
  });

  it('금액 자체가 이상하면 사유가 있어도 거부', () => {
    expect(validateFinalEstimate(estimate(), 0, '사유').ok).toBe(false);
    expect(validateFinalEstimate(estimate(), -1, '사유').ok).toBe(false);
  });
});

describe('개산 정확도 — 정확하게 부르는 업체가 유리해져야 한다', () => {
  const final = (amount: number, over?: string) => ({
    amount,
    overrunReason: over,
    createdAt: '2026-09-05',
  });

  it('개산 중앙값 대비 편차를 낸다', () => {
    // 중앙값 1000만, 확정 1040만 → +4%
    const e = estimate({ final: final(10_400_000) });
    expect(estimateDeviation(e)).toBeCloseTo(0.04, 3);
  });

  it('확정 전이면 편차가 없다', () => {
    expect(estimateDeviation(estimate())).toBeNull();
  });

  it('업체별로 평균 편차와 초과 건수를 낸다', () => {
    const rows = [
      estimate({ id: 'a', final: final(10_000_000) }), // 0%
      estimate({ id: 'b', final: final(11_000_000) }), // +10%
      estimate({ id: 'c', providerId: 'other', final: final(30_000_000, '사유') }),
    ];
    const acc = providerEstimateAccuracy('p1', rows);
    expect(acc.sampleCount).toBe(2);
    expect(acc.averageDeviation).toBeCloseTo(0.05, 3);
    expect(acc.overrunCount).toBe(0);
  });

  it('초과 건수를 따로 센다 — 평균만 보면 가려진다', () => {
    const rows = [
      estimate({ id: 'a', final: final(6_000_000) }), // 크게 낮음
      estimate({ id: 'b', final: final(20_000_000, '석면 추가') }), // 상단 초과
    ];
    expect(providerEstimateAccuracy('p1', rows).overrunCount).toBe(1);
  });

  it('표본이 없으면 평균을 만들어내지 않는다', () => {
    const acc = providerEstimateAccuracy('p1', [estimate()]);
    expect(acc.sampleCount).toBe(0);
    expect(acc.averageDeviation).toBeNull();
  });
});

describe('실사 횟수 제한 — 업체 헛걸음을 막는다', () => {
  const withVisit = (id: string) =>
    estimate({ id, stage: 'VISIT_SCHEDULED', visit: { scheduledAt: '2026-09-10T09:00:00Z' } });

  it('상한까지는 더 잡을 수 있다', () => {
    const rows = Array.from({ length: MAX_SITE_VISITS_PER_REQUEST - 1 }, (_, i) =>
      withVisit(`v${i}`),
    );
    expect(canScheduleMoreVisits(rows)).toBe(true);
  });

  it('상한에 도달하면 더 못 잡는다', () => {
    const rows = Array.from({ length: MAX_SITE_VISITS_PER_REQUEST }, (_, i) => withVisit(`v${i}`));
    expect(canScheduleMoreVisits(rows)).toBe(false);
  });

  it('거절된 건은 자리를 차지하지 않는다 — 한 곳이 빠지면 다른 곳을 부를 수 있어야 한다', () => {
    const rows = [
      ...Array.from({ length: MAX_SITE_VISITS_PER_REQUEST }, (_, i) => withVisit(`v${i}`)),
    ];
    rows[0] = { ...rows[0], stage: 'DECLINED' };
    expect(countScheduledVisits(rows)).toBe(MAX_SITE_VISITS_PER_REQUEST - 1);
    expect(canScheduleMoreVisits(rows)).toBe(true);
  });
});

describe('밀봉 — 업체는 남의 견적을 못 본다', () => {
  const rows = [estimate({ id: 'a', providerId: 'p1' }), estimate({ id: 'b', providerId: 'p2' })];

  it('요청자는 전부 본다', () => {
    expect(visibleDemolitionEstimates(rows, 'consumer', 'consumer')).toHaveLength(2);
  });

  it('업체는 자기 것만 본다', () => {
    const seen = visibleDemolitionEstimates(rows, 'p1', 'consumer');
    expect(seen).toHaveLength(1);
    expect(seen[0].providerId).toBe('p1');
  });
});
