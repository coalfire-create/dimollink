/**
 * 철거 견적 — 개산(범위) → 현장 실사 → 확정(구속력) 3단계.
 *
 * 왜 운반·처리와 다른 모델인가: 철거 금액은 **현장을 봐야 정해진다.** 지중 구조물,
 * 석면 실제 범위, 인접 건물 이격, 진입로 폭은 사진에 안 나온다. 그런데 예전 흐름은
 * 사진만 보고 던진 금액이 그대로 계약금액이 됐다(선착순 수락). 그러면 업체는 가서
 * 보고 나서 추가금을 요구하게 되고, 소비자는 제일 빨리 누른 곳과 묶인다.
 *
 * 그래서 두 금액을 분리한다:
 *  - **개산(preliminary)**: 사진·건축물대장 기준의 **범위**. 구속력 없다.
 *  - **확정(final)**: 실사 후의 단일 금액. 이것이 계약금액이다.
 *
 * 낮게 불러 실사를 따내고 나중에 올리는 것을 막는 장치가 둘이다:
 *  1. 확정이 개산 상단을 넘으면 **초과 사유를 반드시 적는다**(기록으로 남는다).
 *  2. 업체별 **개산 정확도**를 집계해 프로필에 노출한다 — 정확하게 부르는 쪽이 유리해진다.
 */

/** 한 요청에 소비자가 부를 수 있는 실사 업체 수. */
export const MAX_SITE_VISITS_PER_REQUEST = 3;

/**
 * 개산 범위의 최대 배율(상단 ÷ 하단).
 *
 * "100만~5000만" 같은 범위는 정보가 없는 것과 같아서 비교가 불가능하다. 반대로 하한은
 * 두지 않는다 — 확신 있는 업체가 좁게 부르는 것을 막을 이유가 없고, 좁게 불렀다가
 * 넘기면 초과 사유가 남으므로 스스로 리스크를 지는 구조다.
 */
export const MAX_PRELIMINARY_SPREAD_RATIO = 3;

/** 개산 견적 단계. */
export type DemolitionEstimateStage = 'PRELIMINARY' | 'VISIT_SCHEDULED' | 'FINAL' | 'DECLINED';

export interface PreliminaryEstimate {
  /** 개산 하단(원). */
  minAmount: number;
  /** 개산 상단(원). 확정이 이 값을 넘으면 사유가 필요하다. */
  maxAmount: number;
  memo?: string;
  createdAt: string;
}

/**
 * 실사 방식.
 *  - `IN_PERSON`: 업체가 현장에 직접 간다(기존 방식).
 *  - `REMOTE`: 현장에 가지 않고 원격 실사 자료([[remote-survey]] 촬영 패키지·3D 스캔)와
 *    필요하면 영상통화([[video-survey]])로 본다. 이동 없이 같은 사람이 같은 것을 보고 판단한다.
 * 원격 견적이 방문 견적과 얼마나 같은지는 [[estimate-parity]] 가 표본으로 잰다.
 */
export type SiteVisitMode = 'IN_PERSON' | 'REMOTE';

export interface SiteVisit {
  /** 실사 예정 일시(ISO). */
  scheduledAt: string;
  completedAt?: string;
  /** 실사 방식. 없으면 기존 데이터 — `IN_PERSON` 으로 본다. */
  mode?: SiteVisitMode;
  /** 원격 실사에 쓴 촬영 패키지 id([[remote-survey]]). */
  remoteSurveyId?: string;
  /** 원격 실사 중 영상통화 세션 id([[video-survey]]). */
  videoSessionId?: string;
}

/** 실사 방식 — 옛 데이터(mode 없음)는 방문 실사로 본다. */
export function siteVisitMode(visit: SiteVisit | undefined): SiteVisitMode {
  return visit?.mode ?? 'IN_PERSON';
}

export interface FinalEstimate {
  /** 확정 금액(원). 이것이 계약금액이다. */
  amount: number;
  /** 개산 상단을 넘었을 때의 사유. 넘었으면 필수. */
  overrunReason?: string;
  memo?: string;
  createdAt: string;
}

export interface DemolitionEstimate {
  id: string;
  requestId: string;
  providerId: string;
  /** 표시용 업체명. 금액 비교 화면에서 쓴다. */
  providerName?: string;
  stage: DemolitionEstimateStage;
  preliminary: PreliminaryEstimate;
  visit?: SiteVisit;
  final?: FinalEstimate;
  /** 소비자가 이 확정 견적을 수락했는지. 수락 시 매칭이 확정된다. */
  accepted?: boolean;
  createdAt: string;
}

export interface EstimateValidationResult {
  ok: boolean;
  error?: string;
}

/** 개산 범위가 쓸 만한가. 화면과 서버가 같은 답을 내야 해서 여기 하나로 둔다. */
export function validatePreliminaryRange(
  minAmount: number,
  maxAmount: number,
): EstimateValidationResult {
  if (!Number.isInteger(minAmount) || minAmount <= 0) {
    return { ok: false, error: '개산 하단은 1원 이상의 정수여야 합니다.' };
  }
  if (!Number.isInteger(maxAmount) || maxAmount <= 0) {
    return { ok: false, error: '개산 상단은 1원 이상의 정수여야 합니다.' };
  }
  if (maxAmount < minAmount) {
    return { ok: false, error: '개산 상단이 하단보다 작습니다.' };
  }
  if (maxAmount > minAmount * MAX_PRELIMINARY_SPREAD_RATIO) {
    return {
      ok: false,
      error: `개산 범위가 너무 넓습니다. 상단은 하단의 ${MAX_PRELIMINARY_SPREAD_RATIO}배 이내여야 합니다.`,
    };
  }
  return { ok: true };
}

/** 이 확정 금액이 개산 상단을 넘는가 — 넘으면 사유가 필요하다. */
export function exceedsPreliminary(estimate: DemolitionEstimate, finalAmount: number): boolean {
  return finalAmount > estimate.preliminary.maxAmount;
}

/** 확정 견적이 제출 가능한 형태인가. */
export function validateFinalEstimate(
  estimate: DemolitionEstimate,
  amount: number,
  overrunReason: string | undefined,
): EstimateValidationResult {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: '확정 금액은 1원 이상의 정수여야 합니다.' };
  }
  if (exceedsPreliminary(estimate, amount) && (overrunReason ?? '').trim().length === 0) {
    return {
      ok: false,
      error: '개산 범위를 넘는 금액입니다. 초과 사유를 적어 주세요(소비자에게 그대로 표시됩니다).',
    };
  }
  return { ok: true };
}

/** 개산 중앙값 — 정확도 계산의 기준. */
export function preliminaryMidpoint(preliminary: PreliminaryEstimate): number {
  return (preliminary.minAmount + preliminary.maxAmount) / 2;
}

/**
 * 이 건의 개산 대비 확정 편차(비율). 확정이 없으면 null.
 * 양수면 개산보다 비싸게 나온 것.
 */
export function estimateDeviation(estimate: DemolitionEstimate): number | null {
  if (!estimate.final) return null;
  const mid = preliminaryMidpoint(estimate.preliminary);
  if (mid <= 0) return null;
  return estimate.final.amount / mid - 1;
}

export interface ProviderEstimateAccuracy {
  providerId: string;
  /** 확정까지 간 건수. 이 수가 적으면 지표를 신뢰하기 어렵다. */
  sampleCount: number;
  /** 개산 대비 확정 평균 편차(비율). 예: 0.04 = 평균 4% 비쌈. */
  averageDeviation: number | null;
  /** 개산 범위를 넘긴 건수. */
  overrunCount: number;
}

/**
 * 업체별 개산 정확도. **리뷰 별점보다 강한 신호**이고, 우리가 거래 데이터로만 만들 수 있다.
 * 표본이 적을 때 숫자를 단정적으로 보여주면 오해를 부르므로 sampleCount 를 함께 낸다.
 */
export function providerEstimateAccuracy(
  providerId: string,
  estimates: readonly DemolitionEstimate[],
): ProviderEstimateAccuracy {
  const mine = estimates.filter((e) => e.providerId === providerId && e.final);
  const deviations = mine
    .map(estimateDeviation)
    .filter((d): d is number => d !== null);
  const overrunCount = mine.filter((e) => exceedsPreliminary(e, e.final!.amount)).length;
  return {
    providerId,
    sampleCount: mine.length,
    averageDeviation:
      deviations.length > 0
        ? Math.round((deviations.reduce((a, b) => a + b, 0) / deviations.length) * 1000) / 1000
        : null,
    overrunCount,
  };
}

/**
 * 실사를 더 잡을 수 있는가. 소비자가 무분별하게 부르면 업체는 헛걸음만 하고,
 * 그 비용이 결국 견적에 얹힌다. 상한을 둬야 부른 업체의 수주 확률이 올라간다.
 */
export function canScheduleMoreVisits(estimates: readonly DemolitionEstimate[]): boolean {
  return countScheduledVisits(estimates) < MAX_SITE_VISITS_PER_REQUEST;
}

/** 이 요청에 실사가 잡힌(또는 이미 확정까지 간) 업체 수. */
export function countScheduledVisits(estimates: readonly DemolitionEstimate[]): number {
  return estimates.filter((e) => e.visit !== undefined && e.stage !== 'DECLINED').length;
}

/**
 * 밀봉 가시성 — 업체는 남의 견적을 못 본다([[quote]] visibleQuotes 와 같은 원칙).
 * 소비자(요청자)는 자기 요청의 모든 견적을 본다.
 */
export function visibleDemolitionEstimates(
  estimates: readonly DemolitionEstimate[],
  viewerId: string,
  requesterId: string,
): DemolitionEstimate[] {
  if (viewerId === requesterId) return [...estimates];
  return estimates.filter((e) => e.providerId === viewerId);
}
