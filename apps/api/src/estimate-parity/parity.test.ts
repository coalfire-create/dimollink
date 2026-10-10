import { describe, expect, it } from 'vitest';
import {
  PARITY_MIN_SAMPLES,
  PARITY_PASS_SHARE,
  PARITY_TARGET_RATIO,
  compareParitySample,
  computeParityReport,
  dedupeParitySamples,
  deriveParitySample,
  medianOf,
  percentileNearestRank,
  validateManualParityInput,
  type DemolitionEstimate,
  type ParitySample,
} from '@dimol/shared';

/**
 * 원격 vs 방문 정합성 계산 — 금액 비교라 숫자를 정확히 못 박는다.
 * 여기서 정한 정의(중앙값 대비, 소수 4자리 반올림, 최근접 순위)가 시범 운영 판정 그 자체다.
 */

function sample(over: Partial<ParitySample> = {}): ParitySample {
  return {
    id: 's1',
    requestId: 'r1',
    remoteFinalAmounts: [10_000_000],
    inPersonFinalAmounts: [10_000_000],
    source: 'MANUAL',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

/** n 개 현장을 같은 금액으로 만든다(요청 id 는 접두어+번호). */
function sites(n: number, prefix: string, remote: number[], inPerson: number[]): ParitySample[] {
  return Array.from({ length: n }, (_, i) =>
    sample({ id: `${prefix}${i}`, requestId: `${prefix}${i}`, remoteFinalAmounts: remote, inPersonFinalAmounts: inPerson }),
  );
}

function estimate(over: Partial<DemolitionEstimate>): DemolitionEstimate {
  return {
    id: 'e',
    requestId: 'r1',
    providerId: 'p',
    stage: 'FINAL',
    preliminary: { minAmount: 8_000_000, maxAmount: 12_000_000, createdAt: '2026-10-01' },
    createdAt: '2026-10-01',
    ...over,
  };
}

const fin = (amount: number) => ({ amount, createdAt: '2026-10-02' });

describe('정책 상수', () => {
  it('목표 ±10%, 합격 80%, 최소 20곳', () => {
    expect(PARITY_TARGET_RATIO).toBe(0.1);
    expect(PARITY_PASS_SHARE).toBe(0.8);
    expect(PARITY_MIN_SAMPLES).toBe(20);
  });
});

describe('medianOf', () => {
  it('홀수 개는 가운데 값(정렬 후)', () => {
    expect(medianOf([30, 10, 20])).toBe(20);
  });
  it('짝수 개는 가운데 두 값의 평균', () => {
    expect(medianOf([40, 10, 30, 20])).toBe(25);
    expect(medianOf([9_000_000, 10_000_000])).toBe(9_500_000);
  });
  it('빈 배열은 null', () => {
    expect(medianOf([])).toBeNull();
  });
});

describe('percentileNearestRank', () => {
  it('1~10 의 80백분위는 8 (ceil(0.8×10)=8번째)', () => {
    expect(percentileNearestRank([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 0.8)).toBe(8);
  });
  it('3개의 80백분위는 3번째(ceil 2.4)', () => {
    expect(percentileNearestRank([1, 2, 3], 0.8)).toBe(3);
  });
  it('부동소수 오차(0.28×25=7.000000000000001)가 순위를 밀지 않는다', () => {
    const values = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(percentileNearestRank(values, 0.28)).toBe(7);
  });
  it('빈 배열·범위 밖 p 는 null', () => {
    expect(percentileNearestRank([], 0.8)).toBeNull();
    expect(percentileNearestRank([1], 0)).toBeNull();
    expect(percentileNearestRank([1], 1.5)).toBeNull();
  });
});

describe('deriveParitySample — 실사 방식별 확정 금액 분리', () => {
  it('원격·방문을 나누고, mode 없는 옛 데이터는 방문으로 본다', () => {
    const derived = deriveParitySample([
      estimate({ id: 'a', visit: { scheduledAt: 'x', mode: 'REMOTE' }, final: fin(9_000_000) }),
      estimate({ id: 'b', visit: { scheduledAt: 'x', mode: 'IN_PERSON' }, final: fin(11_000_000) }),
      estimate({ id: 'c', visit: { scheduledAt: 'x' }, final: fin(10_000_000) }),
    ]);
    expect(derived).toEqual({
      requestId: 'r1',
      remoteFinalAmounts: [9_000_000],
      inPersonFinalAmounts: [10_000_000, 11_000_000],
    });
  });

  it('확정 없는 견적·거절된 견적·다른 요청은 뺀다', () => {
    const derived = deriveParitySample([
      estimate({ id: 'a', visit: { scheduledAt: 'x', mode: 'REMOTE' }, final: fin(9_000_000) }),
      estimate({ id: 'b', stage: 'VISIT_SCHEDULED', visit: { scheduledAt: 'x' } }),
      estimate({ id: 'c', stage: 'DECLINED', visit: { scheduledAt: 'x' }, final: fin(1) }),
      estimate({ id: 'd', requestId: 'other', visit: { scheduledAt: 'x' }, final: fin(5) }),
      estimate({ id: 'e', visit: { scheduledAt: 'x' }, final: fin(10_000_000) }),
    ]);
    expect(derived?.inPersonFinalAmounts).toEqual([10_000_000]);
  });

  it('한쪽만 있으면 null', () => {
    expect(
      deriveParitySample([estimate({ visit: { scheduledAt: 'x' }, final: fin(10_000_000) })]),
    ).toBeNull();
    expect(
      deriveParitySample([
        estimate({ visit: { scheduledAt: 'x', mode: 'REMOTE' }, final: fin(10_000_000) }),
      ]),
    ).toBeNull();
    expect(deriveParitySample([])).toBeNull();
  });

  it('0원·음수 확정 금액은 비교에 넣지 않는다', () => {
    expect(
      deriveParitySample([
        estimate({ id: 'a', visit: { scheduledAt: 'x', mode: 'REMOTE' }, final: fin(0) }),
        estimate({ id: 'b', visit: { scheduledAt: 'x' }, final: fin(10_000_000) }),
      ]),
    ).toBeNull();
  });
});

describe('compareParitySample — 현장 하나', () => {
  it('원격 중앙값 ÷ 방문 중앙값 − 1, 업체 간 편차 = (최대−최소) ÷ 방문 중앙값', () => {
    const r = compareParitySample(
      sample({
        remoteFinalAmounts: [9_500_000],
        inPersonFinalAmounts: [12_000_000, 10_000_000, 11_000_000],
      }),
    )!;
    expect(r.remoteMedian).toBe(9_500_000);
    expect(r.inPersonMedian).toBe(11_000_000);
    expect(r.diffRatio).toBe(-0.1364); // 9.5/11 − 1 = −0.13636…
    expect(r.absDiffRatio).toBe(0.1364);
    expect(r.withinTarget).toBe(false);
    expect(r.inPersonSpreadRatio).toBe(0.1818); // 2/11
    expect(r.remoteWithinSpread).toBe(true);
  });

  it('정확히 +10% 는 목표 안(부동소수 0.10000000000000009 방지)', () => {
    const r = compareParitySample(
      sample({ remoteFinalAmounts: [11_000_000], inPersonFinalAmounts: [10_000_000] }),
    )!;
    expect(r.diffRatio).toBe(0.1);
    expect(r.withinTarget).toBe(true);
  });

  it('+10.01% 는 목표 밖', () => {
    const r = compareParitySample(
      sample({ remoteFinalAmounts: [11_001_000], inPersonFinalAmounts: [10_000_000] }),
    )!;
    expect(r.diffRatio).toBe(0.1001);
    expect(r.withinTarget).toBe(false);
  });

  it('짝수 개 중앙값 + 방문 편차 0 이면 원격 차이가 편차보다 크다', () => {
    const r = compareParitySample(
      sample({
        remoteFinalAmounts: [9_000_000, 10_000_000],
        inPersonFinalAmounts: [10_000_000, 10_000_000],
      }),
    )!;
    expect(r.remoteMedian).toBe(9_500_000);
    expect(r.diffRatio).toBe(-0.05);
    expect(r.inPersonSpreadRatio).toBe(0);
    expect(r.remoteWithinSpread).toBe(false);
  });

  it('방문 견적이 1개면 편차를 못 잰다(null)', () => {
    const r = compareParitySample(sample())!;
    expect(r.inPersonSpreadRatio).toBeNull();
    expect(r.remoteWithinSpread).toBeNull();
  });

  it('0·음수 금액은 걸러내고, 남는 게 없으면 비교 불가', () => {
    expect(compareParitySample(sample({ inPersonFinalAmounts: [0, -5] }))).toBeNull();
    expect(compareParitySample(sample({ remoteFinalAmounts: [] }))).toBeNull();
    const r = compareParitySample(
      sample({ remoteFinalAmounts: [10_000_000], inPersonFinalAmounts: [0, 8_000_000] }),
    )!;
    expect(r.inPersonMedian).toBe(8_000_000);
    expect(r.diffRatio).toBe(0.25);
  });

  it('톤 오차 = 추정 ÷ 실적 − 1, 둘 다 있을 때만', () => {
    expect(compareParitySample(sample({ estimatedTon: 12, actualTon: 10 }))!.tonErrorRatio).toBe(0.2);
    expect(compareParitySample(sample({ estimatedTon: 12 }))!.tonErrorRatio).toBeNull();
    expect(compareParitySample(sample({ estimatedTon: 12, actualTon: 0 }))!.tonErrorRatio).toBeNull();
  });
});

describe('dedupeParitySamples', () => {
  it('같은 요청이면 MANUAL 을 남긴다(순서 무관)', () => {
    const auto = sample({ id: 'a', source: 'AUTO' });
    const manual = sample({ id: 'm', source: 'MANUAL' });
    expect(dedupeParitySamples([auto, manual]).map((s) => s.id)).toEqual(['m']);
    expect(dedupeParitySamples([manual, auto]).map((s) => s.id)).toEqual(['m']);
  });
  it('같은 출처끼리는 나중 것', () => {
    const old = sample({ id: 'old', createdAt: '2026-10-01' });
    const neu = sample({ id: 'new', createdAt: '2026-10-05' });
    expect(dedupeParitySamples([neu, old]).map((s) => s.id)).toEqual(['new']);
  });
});

describe('computeParityReport — 판정', () => {
  // 방문 [9.5M, 10.5M] → 중앙값 10M, 업체 간 편차 10%
  const IN_PERSON = [9_500_000, 10_500_000];

  it('20곳 중 16곳(80%)이 ±10% 안이고 차이 ≤ 업체 간 편차 → PASS', () => {
    const report = computeParityReport([
      ...sites(16, 'ok', [10_200_000], IN_PERSON), // +2%
      ...sites(4, 'far', [12_000_000], IN_PERSON), // +20%
    ]);
    expect(report.n).toBe(20);
    expect(report.shareWithinTarget).toBe(0.8);
    expect(report.medianAbsDiff).toBe(0.02);
    expect(report.p80AbsDiff).toBe(0.02); // 16번째 값
    expect(report.spread.sitesWithSpread).toBe(20);
    expect(report.spread.medianInPersonSpread).toBe(0.1);
    expect(report.spread.shareRemoteWithinSpread).toBe(0.8);
    expect(report.bias.direction).toBe('NONE');
    expect(report.bias.remoteHigherCount).toBe(20);
    expect(report.bias.meanSignedDiff).toBe(0.056); // (16×0.02 + 4×0.2) / 20
    expect(report.verdict).toBe('PASS');
  });

  it('15곳(75%)만 안이면 FAIL', () => {
    const report = computeParityReport([
      ...sites(15, 'ok', [10_200_000], IN_PERSON),
      ...sites(5, 'far', [12_000_000], IN_PERSON),
    ]);
    expect(report.shareWithinTarget).toBe(0.75);
    expect(report.p80AbsDiff).toBe(0.2);
    expect(report.verdict).toBe('FAIL');
  });

  it('전부 ±10% 안이어도 업체 간 편차보다 크면 FAIL, 치우침은 원격이 높음', () => {
    // 방문 [9.8M, 10.2M] → 편차 4%, 원격 +8%
    const report = computeParityReport(sites(20, 's', [10_800_000], [9_800_000, 10_200_000]));
    expect(report.shareWithinTarget).toBe(1);
    expect(report.medianAbsDiff).toBe(0.08);
    expect(report.spread.medianInPersonSpread).toBe(0.04);
    expect(report.verdict).toBe('FAIL');
    expect(report.bias.direction).toBe('REMOTE_HIGHER');
    expect(report.bias.medianSignedDiff).toBe(0.08);
  });

  it('원격이 계통적으로 5% 낮으면 REMOTE_LOWER, 편차 미측정은 판정을 막지 않되 근거에 적는다', () => {
    const report = computeParityReport(sites(20, 's', [9_500_000], [10_000_000]));
    expect(report.bias.direction).toBe('REMOTE_LOWER');
    expect(report.bias.medianSignedDiff).toBe(-0.05);
    expect(report.bias.meanSignedDiff).toBe(-0.05);
    expect(report.bias.remoteLowerCount).toBe(20);
    expect(report.spread.sitesWithSpread).toBe(0);
    expect(report.spread.shareRemoteWithinSpread).toBeNull();
    expect(report.verdict).toBe('PASS');
    expect(report.reasons.some((r) => r.includes('업체 간 편차와는 비교하지 못했습니다'))).toBe(true);
    expect(report.reasons.some((r) => r.includes('낮게'))).toBe(true);
  });

  it('치우침 ±3% 이내는 NONE(−3% 경계 포함)', () => {
    const report = computeParityReport(sites(20, 's', [9_700_000], [10_000_000]));
    expect(report.bias.medianSignedDiff).toBe(-0.03);
    expect(report.bias.direction).toBe('NONE');
  });

  it('19곳이면 숫자는 내도 판정은 INSUFFICIENT_SAMPLE', () => {
    const report = computeParityReport(sites(19, 's', [10_000_000], [10_000_000]));
    expect(report.n).toBe(19);
    expect(report.shareWithinTarget).toBe(1);
    expect(report.verdict).toBe('INSUFFICIENT_SAMPLE');
  });

  it('빈 입력은 전부 null 이고 표본 부족', () => {
    const report = computeParityReport([]);
    expect(report.n).toBe(0);
    expect(report.medianAbsDiff).toBeNull();
    expect(report.p80AbsDiff).toBeNull();
    expect(report.shareWithinTarget).toBeNull();
    expect(report.verdict).toBe('INSUFFICIENT_SAMPLE');
  });

  it('비교 불가 표본은 n 에서 빠지고 excluded 로 센다, 중복 요청은 한 곳', () => {
    const report = computeParityReport([
      sample({ id: 'a', requestId: 'r1', source: 'AUTO' }),
      sample({ id: 'm', requestId: 'r1', source: 'MANUAL', remoteFinalAmounts: [11_000_000] }),
      sample({ id: 'bad', requestId: 'r2', inPersonFinalAmounts: [0] }),
    ]);
    expect(report.n).toBe(1);
    expect(report.excluded).toBe(1);
    expect(report.sites[0]!.sampleId).toBe('m');
  });

  it('톤 오차 — |오차| 중앙값과 부호 있는 평균', () => {
    const report = computeParityReport([
      sample({ id: 'a', requestId: 'a', estimatedTon: 12, actualTon: 10 }), // +20%
      sample({ id: 'b', requestId: 'b', estimatedTon: 9, actualTon: 10 }), // −10%
      sample({ id: 'c', requestId: 'c' }), // 실적 없음
    ]);
    expect(report.tonnage.sitesWithActual).toBe(2);
    expect(report.tonnage.medianAbsTonError).toBe(0.15);
    expect(report.tonnage.meanSignedTonError).toBe(0.05);
  });
});

describe('validateManualParityInput', () => {
  const ok = {
    requestId: ' pilot-01 ',
    remoteFinalAmounts: [10_000_000],
    inPersonFinalAmounts: ['11000000', 10_500_000],
    structure: 'RC',
    floorAreaM2: 120.5,
    actualTon: 190,
    note: '  1층 상가  ',
  };

  it('정상 입력은 정리해서 돌려준다(금액 정렬·문자열 숫자 허용)', () => {
    expect(validateManualParityInput(ok)).toEqual({
      requestId: 'pilot-01',
      structure: 'RC',
      floorAreaM2: 120.5,
      remoteFinalAmounts: [10_000_000],
      inPersonFinalAmounts: [10_500_000, 11_000_000],
      estimatedTon: undefined,
      actualTon: 190,
      note: '1층 상가',
    });
  });

  it.each([
    [{ ...ok, requestId: '' }, '요청 id'],
    [{ ...ok, remoteFinalAmounts: [] }, '원격 확정 금액을'],
    [{ ...ok, inPersonFinalAmounts: [1.5] }, '방문 확정 금액은'],
    [{ ...ok, inPersonFinalAmounts: [-1] }, '방문 확정 금액은'],
    [{ ...ok, remoteFinalAmounts: 'x' }, '원격 확정 금액을'],
    [{ ...ok, structure: 'STEEL' }, '구조는'],
    [{ ...ok, actualTon: 0 }, '실적 톤수'],
    [{ ...ok, floorAreaM2: 'abc' }, '연면적'],
  ])('잘못된 입력은 오류 문장(%#)', (body, expected) => {
    const result = validateManualParityInput(body);
    expect(typeof result).toBe('string');
    expect(result as string).toContain(expected);
  });
});
