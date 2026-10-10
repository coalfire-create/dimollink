/**
 * 원격 vs 방문 견적 정합성 — "원격 견적이 방문 견적과 거의 같다"를 숫자로 증명한다.
 *
 * 왜 "같다"의 기준이 0% 가 아닌가: **방문 견적끼리도 업체마다 10~20% 차이가 난다.**
 * 그래서 현실적인 목표는 둘이다.
 *  1. 원격과 방문의 차이가 **방문 견적끼리의 차이(업체 간 편차)보다 크지 않다** —
 *     원격 견적을 "또 한 곳의 방문 업체"와 구별할 수 없다는 뜻이다.
 *  2. 대부분의 현장에서 그 차이가 **±10% 이내**다.
 *
 * 표본은 두 갈래다.
 *  - `AUTO`: 플랫폼 안의 철거 견적([[demolition-estimate]])에서 실사 방식별 확정 금액을 뽑는다.
 *  - `MANUAL`: 시범 운영(20~30곳)에서 직원이 모은 견적을 입력한다(플랫폼 밖 견적 포함).
 *
 * 장기적으로는 올바로 처리 실적 톤수(`actualTon`)로 물량 추정 자체를 보정한다
 * ([[waste-composition]] 의 예측 톤 ↔ 실적 톤 회귀와 같은 데이터).
 *
 * 비율 값은 전부 **소수 4자리(0.01%)로 반올림**해서 비교한다. 110/100-1 이
 * 0.10000000000000009 가 돼서 "정확히 10%"가 기준 밖으로 떨어지는 일을 막기 위해서다.
 */

import { siteVisitMode, type DemolitionEstimate } from './demolition-estimate.js';
import type { BuildingStructure } from './estimation.js';

/**
 * 목표 오차 — 원격 견적이 방문 견적 중앙값의 ±10% 안이면 "거의 같다"로 본다.
 * 방문 견적끼리의 업체 간 차이(10~20%)의 하단이다. 이보다 엄격하게 잡으면 방문끼리도
 * 통과 못 하는 기준이 되고, 느슨하게 잡으면 "원격이면 대충"이라는 의심을 못 걷어낸다.
 */
export const PARITY_TARGET_RATIO = 0.1;

/**
 * 합격 비율 — 현장의 80% 이상이 목표 오차 안이어야 PASS.
 * 100% 를 요구하지 않는 이유: 지중 구조물·숨은 석면처럼 **방문해도 못 보는 변수**가
 * 일부 현장에는 반드시 있다. 20% 의 여유는 그 몫이다.
 */
export const PARITY_PASS_SHARE = 0.8;

/**
 * 판정 최소 표본 — 시범 운영 목표(20~30곳)의 하단.
 * 10곳으로 80% 를 말하면 한 곳이 비율을 10%p 흔든다. 20곳 미만이면 숫자는 보여주되
 * 합격/불합격은 말하지 않는다.
 */
export const PARITY_MIN_SAMPLES = 20;

/**
 * 치우침 판정 기준 — 부호 있는 차이의 중앙값이 ±3% 를 넘으면 "원격이 계통적으로
 * 낮다/높다"로 본다. 그 안이면 우연한 흔들림과 구별하기 어렵다.
 */
export const PARITY_BIAS_THRESHOLD = 0.03;

export type ParitySampleSource = 'AUTO' | 'MANUAL';

export interface ParitySample {
  id: string;
  /** 플랫폼 요청 id. 플랫폼 밖 시범 현장은 직원이 정한 현장 식별자. */
  requestId: string;
  structure?: BuildingStructure;
  floorAreaM2?: number;
  /** 원격 실사 후 확정 금액들(원). */
  remoteFinalAmounts: number[];
  /** 방문 실사 후 확정 금액들(원). 2개 이상이면 업체 간 편차를 잴 수 있다. */
  inPersonFinalAmounts: number[];
  /** 플랫폼이 추정한 폐기물 톤수. */
  estimatedTon?: number;
  /** 철거 후 실제 처리 톤수(올바로 처리 실적 또는 계량표). */
  actualTon?: number;
  source: ParitySampleSource;
  note?: string;
  createdAt: string;
}

/** 견적에서 뽑은 금액 — 저장 전 형태(현장 정보·톤수는 호출부가 붙인다). */
export interface DerivedParityAmounts {
  requestId: string;
  remoteFinalAmounts: number[];
  inPersonFinalAmounts: number[];
}

/** 0.01% 단위 반올림. 비교 전에 반드시 거친다(파일 머리말 참고). */
function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : roundRatio(value);
}

function isPositiveAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * 한 요청의 철거 견적에서 실사 방식별 확정 금액을 나눈다.
 * 원격·방문이 **둘 다 있을 때만** 비교할 수 있으므로 한쪽이라도 없으면 null.
 * 거절(DECLINED)된 견적과 금액이 비정상인 견적은 뺀다. 첫 견적의 요청 id 만 본다.
 */
export function deriveParitySample(
  estimates: readonly DemolitionEstimate[],
): DerivedParityAmounts | null {
  if (estimates.length === 0) return null;
  const requestId = estimates[0]!.requestId;
  const remote: number[] = [];
  const inPerson: number[] = [];
  for (const e of estimates) {
    if (e.requestId !== requestId || e.stage === 'DECLINED') continue;
    const amount = e.final?.amount;
    if (!isPositiveAmount(amount)) continue;
    if (siteVisitMode(e.visit) === 'REMOTE') remote.push(amount);
    else inPerson.push(amount);
  }
  if (remote.length === 0 || inPerson.length === 0) return null;
  return {
    requestId,
    remoteFinalAmounts: remote.sort((a, b) => a - b),
    inPersonFinalAmounts: inPerson.sort((a, b) => a - b),
  };
}

/** 중앙값. 짝수 개면 가운데 두 값의 평균. 빈 배열은 null. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * 백분위수 — **최근접 순위(nearest-rank)** 방식: 정렬 후 ceil(p×n) 번째 값.
 * 보간하지 않으므로 항상 실제로 관측된 값이 나온다("80% 의 현장이 이 값 이하").
 */
export function percentileNearestRank(values: readonly number[], p: number): number | null {
  if (values.length === 0 || !(p > 0) || p > 1) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // 0.28×25 = 7.000000000000001 같은 부동소수 오차가 순위를 한 칸 밀지 않게 아주 작은 값을 뺀다.
  const rank = Math.ceil(p * sorted.length - 1e-9);
  return sorted[Math.max(1, rank) - 1]!;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 현장 하나의 비교 결과. */
export interface ParitySiteResult {
  sampleId: string;
  requestId: string;
  source: ParitySampleSource;
  remoteMedian: number;
  inPersonMedian: number;
  /**
   * 원격 vs 방문 차이(부호 있음) = 원격 중앙값 ÷ 방문 중앙값 − 1.
   * 음수면 원격이 싸게 나온 것. 기준(분모)은 방문 쪽이다 — "방문했으면 얼마였을까"가 정답이다.
   */
  diffRatio: number;
  absDiffRatio: number;
  withinTarget: boolean;
  /**
   * 방문 업체 간 편차 = (방문 최댓값 − 최솟값) ÷ 방문 중앙값. 방문 견적이 2개 이상일 때만.
   * diffRatio 와 분모를 같게 둬야 두 값을 바로 비교할 수 있다.
   */
  inPersonSpreadRatio: number | null;
  /** |원격 차이| ≤ 방문 업체 간 편차인가. 편차를 못 재면 null. */
  remoteWithinSpread: boolean | null;
  /** 톤수 오차 = 추정 톤 ÷ 실적 톤 − 1. 둘 다 있을 때만. */
  tonErrorRatio: number | null;
}

/** 표본 하나를 비교한다. 금액이 비었거나 0 이하뿐이면 비교 불가(null). */
export function compareParitySample(sample: ParitySample): ParitySiteResult | null {
  const remote = sample.remoteFinalAmounts.filter(isPositiveAmount);
  const inPerson = sample.inPersonFinalAmounts.filter(isPositiveAmount);
  const remoteMedian = medianOf(remote);
  const inPersonMedian = medianOf(inPerson);
  if (remoteMedian === null || inPersonMedian === null || inPersonMedian <= 0) return null;

  const diffRatio = roundRatio(remoteMedian / inPersonMedian - 1);
  const absDiffRatio = Math.abs(diffRatio);
  const inPersonSpreadRatio =
    inPerson.length >= 2
      ? roundRatio((Math.max(...inPerson) - Math.min(...inPerson)) / inPersonMedian)
      : null;
  const tonErrorRatio =
    isPositiveAmount(sample.estimatedTon) && isPositiveAmount(sample.actualTon)
      ? roundRatio(sample.estimatedTon / sample.actualTon - 1)
      : null;

  return {
    sampleId: sample.id,
    requestId: sample.requestId,
    source: sample.source,
    remoteMedian,
    inPersonMedian,
    diffRatio,
    absDiffRatio,
    withinTarget: absDiffRatio <= PARITY_TARGET_RATIO,
    inPersonSpreadRatio,
    remoteWithinSpread: inPersonSpreadRatio === null ? null : absDiffRatio <= inPersonSpreadRatio,
    tonErrorRatio,
  };
}

/**
 * 같은 요청이 AUTO·MANUAL 로 두 번 들어오면 한 현장이 두 표를 가진다.
 * 직원이 확인해 넣은 MANUAL 을 남긴다(시범 운영 기록이 기준 자료다).
 * 같은 출처끼리 겹치면 나중에 만든 것을 남긴다.
 */
export function dedupeParitySamples(samples: readonly ParitySample[]): ParitySample[] {
  const byRequest = new Map<string, ParitySample>();
  for (const s of samples) {
    const cur = byRequest.get(s.requestId);
    if (!cur) {
      byRequest.set(s.requestId, s);
      continue;
    }
    if (cur.source !== s.source) {
      if (s.source === 'MANUAL') byRequest.set(s.requestId, s);
      continue;
    }
    if (s.createdAt >= cur.createdAt) byRequest.set(s.requestId, s);
  }
  return [...byRequest.values()];
}

export type ParityVerdict = 'INSUFFICIENT_SAMPLE' | 'PASS' | 'FAIL';
export type ParityBiasDirection = 'REMOTE_LOWER' | 'REMOTE_HIGHER' | 'NONE';

export interface ParityReport {
  /** 비교에 쓴 현장 수(중복 제거·비교 불가 제외 후). */
  n: number;
  /** 비교 불가로 빠진 표본 수. */
  excluded: number;
  /** |차이|의 중앙값. */
  medianAbsDiff: number | null;
  /** |차이|의 80백분위(최근접 순위). */
  p80AbsDiff: number | null;
  /** ±목표 오차 안의 현장 비율(0~1). */
  shareWithinTarget: number | null;
  bias: {
    /** 부호 있는 차이의 중앙값. 음수면 원격이 대체로 싸다. */
    medianSignedDiff: number | null;
    meanSignedDiff: number | null;
    remoteLowerCount: number;
    remoteHigherCount: number;
    direction: ParityBiasDirection;
  };
  spread: {
    /** 방문 견적이 2개 이상이라 업체 간 편차를 잰 현장 수. */
    sitesWithSpread: number;
    medianInPersonSpread: number | null;
    /** 그 현장들 중 |원격 차이| ≤ 업체 간 편차인 비율. */
    shareRemoteWithinSpread: number | null;
  };
  tonnage: {
    /** 추정·실적 톤이 둘 다 있는 현장 수. */
    sitesWithActual: number;
    medianAbsTonError: number | null;
    meanSignedTonError: number | null;
  };
  verdict: ParityVerdict;
  /** 판정 근거 — 관리자 화면에 그대로 보여주는 쉬운 문장. */
  reasons: string[];
  sites: ParitySiteResult[];
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}

/**
 * 정합성 보고서.
 *
 * 판정 규칙:
 *  - 현장 < PARITY_MIN_SAMPLES → INSUFFICIENT_SAMPLE (숫자는 내지만 판정은 보류).
 *  - PASS = ① ±목표 오차 안 비율 ≥ PARITY_PASS_SHARE
 *         ② 업체 간 편차를 잰 현장이 있으면 |차이| 중앙값 ≤ 업체 간 편차 중앙값.
 *           (편차를 잰 현장이 하나도 없으면 ②는 판단하지 않고 근거에 그 사실을 적는다.)
 *  - 아니면 FAIL.
 */
export function computeParityReport(samples: readonly ParitySample[]): ParityReport {
  const deduped = dedupeParitySamples(samples);
  const sites: ParitySiteResult[] = [];
  for (const s of deduped) {
    const r = compareParitySample(s);
    if (r) sites.push(r);
  }
  const n = sites.length;
  const absDiffs = sites.map((s) => s.absDiffRatio);
  const signed = sites.map((s) => s.diffRatio);

  const medianAbsDiff = roundOrNull(medianOf(absDiffs));
  const p80AbsDiff = percentileNearestRank(absDiffs, 0.8);
  const shareWithinTarget =
    n > 0 ? roundRatio(sites.filter((s) => s.withinTarget).length / n) : null;

  const medianSignedDiff = roundOrNull(medianOf(signed));
  const meanSigned = mean(signed);
  const direction: ParityBiasDirection =
    medianSignedDiff === null || Math.abs(medianSignedDiff) <= PARITY_BIAS_THRESHOLD
      ? 'NONE'
      : medianSignedDiff < 0
        ? 'REMOTE_LOWER'
        : 'REMOTE_HIGHER';

  const withSpread = sites.filter((s) => s.inPersonSpreadRatio !== null);
  const medianInPersonSpread = roundOrNull(medianOf(withSpread.map((s) => s.inPersonSpreadRatio!)));
  const shareRemoteWithinSpread =
    withSpread.length > 0
      ? roundRatio(withSpread.filter((s) => s.remoteWithinSpread).length / withSpread.length)
      : null;

  const withTon = sites.filter((s) => s.tonErrorRatio !== null);
  const tonErrors = withTon.map((s) => s.tonErrorRatio!);
  const medianAbsTon = roundOrNull(medianOf(tonErrors.map(Math.abs)));
  const meanTon = mean(tonErrors);

  const reasons: string[] = [];
  let verdict: ParityVerdict;
  if (n < PARITY_MIN_SAMPLES) {
    verdict = 'INSUFFICIENT_SAMPLE';
    reasons.push(
      `비교한 현장이 ${n}곳이라 아직 판정하지 않습니다. 최소 ${PARITY_MIN_SAMPLES}곳이 필요합니다.`,
    );
  } else {
    const shareOk = shareWithinTarget !== null && shareWithinTarget >= PARITY_PASS_SHARE;
    reasons.push(
      `${pct(shareWithinTarget ?? 0)}의 현장이 방문 견적과 ±${pct(PARITY_TARGET_RATIO)} 안입니다` +
        ` (기준 ${pct(PARITY_PASS_SHARE)} 이상${shareOk ? ', 충족' : ', 미달'}).`,
    );
    let spreadOk = true;
    if (medianInPersonSpread === null || medianAbsDiff === null) {
      reasons.push('방문 견적이 2곳 이상인 현장이 없어 업체 간 편차와는 비교하지 못했습니다.');
    } else {
      spreadOk = medianAbsDiff <= medianInPersonSpread;
      reasons.push(
        `원격과 방문의 차이(중앙값 ${pct(medianAbsDiff)})가 방문 업체끼리의 차이` +
          `(중앙값 ${pct(medianInPersonSpread)})${spreadOk ? '보다 크지 않습니다' : '보다 큽니다'}.`,
      );
    }
    verdict = shareOk && spreadOk ? 'PASS' : 'FAIL';
  }
  if (direction === 'REMOTE_LOWER') {
    reasons.push(`원격 견적이 대체로 ${pct(-medianSignedDiff!)} 낮게 나옵니다. 놓치는 항목이 없는지 보세요.`);
  } else if (direction === 'REMOTE_HIGHER') {
    reasons.push(`원격 견적이 대체로 ${pct(medianSignedDiff!)} 높게 나옵니다. 불확실성을 금액에 얹고 있을 수 있습니다.`);
  }

  return {
    n,
    excluded: deduped.length - n,
    medianAbsDiff,
    p80AbsDiff,
    shareWithinTarget,
    bias: {
      medianSignedDiff,
      meanSignedDiff: meanSigned === null ? null : roundRatio(meanSigned),
      remoteLowerCount: sites.filter((s) => s.diffRatio < 0).length,
      remoteHigherCount: sites.filter((s) => s.diffRatio > 0).length,
      direction,
    },
    spread: {
      sitesWithSpread: withSpread.length,
      medianInPersonSpread,
      shareRemoteWithinSpread,
    },
    tonnage: {
      sitesWithActual: withTon.length,
      medianAbsTonError: medianAbsTon,
      meanSignedTonError: meanTon === null ? null : roundRatio(meanTon),
    },
    verdict,
    reasons,
    sites,
  };
}

/** 판정 한 줄 요약 — 화면 제목용. */
export const PARITY_VERDICT_LABELS: Record<ParityVerdict, string> = {
  INSUFFICIENT_SAMPLE: '표본 부족 — 아직 판정하지 않음',
  PASS: '합격 — 원격 견적이 방문 견적과 거의 같습니다',
  FAIL: '불합격 — 원격 견적이 방문 견적과 차이가 큽니다',
};

export interface ManualParityInput {
  requestId: string;
  structure?: BuildingStructure;
  floorAreaM2?: number;
  remoteFinalAmounts: number[];
  inPersonFinalAmounts: number[];
  estimatedTon?: number;
  actualTon?: number;
  note?: string;
}

const STRUCTURES: readonly BuildingStructure[] = ['RC', 'BRICK', 'WOOD'];

function optionalPositive(raw: unknown, label: string): number | undefined | string {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return `${label}은(는) 0보다 큰 숫자여야 합니다.`;
  return n;
}

function amountList(raw: unknown, label: string): number[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return `${label}을(를) 1개 이상 입력해 주세요.`;
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n) || n <= 0) return `${label}은(는) 1원 이상의 정수여야 합니다.`;
    out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * 직원 입력(시범 현장) 검증. 화면과 서버가 같은 답을 내야 해서 여기 하나로 둔다.
 * 성공하면 정리된 입력, 실패하면 오류 문장.
 */
export function validateManualParityInput(body: unknown): ManualParityInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const requestId = typeof b.requestId === 'string' ? b.requestId.trim() : '';
  if (!requestId) return '요청 id(또는 현장 식별자)를 입력해 주세요.';
  const remote = amountList(b.remoteFinalAmounts, '원격 확정 금액');
  if (typeof remote === 'string') return remote;
  const inPerson = amountList(b.inPersonFinalAmounts, '방문 확정 금액');
  if (typeof inPerson === 'string') return inPerson;
  let structure: BuildingStructure | undefined;
  if (b.structure !== undefined && b.structure !== null && b.structure !== '') {
    if (!STRUCTURES.includes(b.structure as BuildingStructure)) {
      return '구조는 RC·BRICK·WOOD 중 하나여야 합니다.';
    }
    structure = b.structure as BuildingStructure;
  }
  const floorAreaM2 = optionalPositive(b.floorAreaM2, '연면적');
  if (typeof floorAreaM2 === 'string') return floorAreaM2;
  const estimatedTon = optionalPositive(b.estimatedTon, '추정 톤수');
  if (typeof estimatedTon === 'string') return estimatedTon;
  const actualTon = optionalPositive(b.actualTon, '실적 톤수');
  if (typeof actualTon === 'string') return actualTon;
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : undefined;
  return {
    requestId,
    structure,
    floorAreaM2,
    remoteFinalAmounts: remote,
    inPersonFinalAmounts: inPerson,
    estimatedTon,
    actualTon,
    note,
  };
}
