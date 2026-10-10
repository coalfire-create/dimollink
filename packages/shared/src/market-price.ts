/**
 * 공공 철거 계약 시세 (로드맵 Phase 3 · 견적 히스토리/평균 시세, Phase 6 · AI 견적 보조).
 *
 * 민간 철거 견적은 공개된 대량 데이터가 없다. 나라장터(조달청)에는 공공 건물 철거공사의
 * 계약 금액이 수천 건 단위로 공개돼 있어, 이를 "구조별 ㎡당 철거비"의 기준선으로 쓴다.
 * 공공 공사는 설계·감리·안전관리 비용이 붙어 민간보다 비싼 편이므로, 그대로 쓰지 않고
 * 시범 현장(민간 실견적)과 비교해 구한 보정 계수를 곱해서 쓴다([[calibrationFactor]]).
 */

import type { BuildingStructure } from './estimation.js';

/** 계약명에 이 단어가 있어야 철거 계약으로 본다. */
export const DEMOLITION_CONTRACT_KEYWORDS = ['철거', '해체', '멸실'] as const;

/**
 * ㎡당 단가 통계에서 빼는 계약. 건물 전체 철거가 아니라 일부만 뜯는 공사라
 * 연면적으로 나누면 단가가 왜곡된다(석면만 제거, 내부만 철거, 시설물 철거 등).
 */
export const PARTIAL_DEMOLITION_KEYWORDS = [
  '석면',
  '내부',
  '부분',
  '실내',
  '인테리어',
  '간판',
  '담장',
  '옹벽',
  '교량',
  '포장',
  '철탑',
  '수목',
  '시설물',
  '가설',
] as const;

/** 1평 = 3.3058㎡. */
export const SQM_PER_PYEONG = 3.3058;

/** 구조별 통계를 내기 위한 최소 표본 수. 이보다 적으면 중앙값이 한두 건에 휘둘린다. */
export const MARKET_PRICE_MIN_SAMPLES = 5;

/**
 * ㎡당 단가가 이 범위를 벗어나면 연면적 추출이 틀린 것으로 보고 뺀다.
 * (예: 계약명의 "1,234㎡"가 대지면적이거나, 숫자가 공사번호인 경우)
 */
export const MARKET_PRICE_SANE_RANGE_PER_SQM = { min: 10_000, max: 2_000_000 } as const;

/** 나라장터 계약 1건을 정규화한 형태. */
export interface PublicDemolitionContract {
  /** 통합계약번호(변경 차수가 달라도 같은 계약이면 같은 값). */
  id: string;
  name: string;
  /** 계약 금액(원, 부가세 포함 — 나라장터 표기 기준). */
  amount: number;
  /** 계약 체결일 (YYYY-MM-DD). */
  contractDate?: string;
  agency?: string;
  region?: string;
  /** 계약명에서 뽑은 연면적(㎡). 없으면 ㎡당 단가 계산에서 빠진다. */
  areaM2?: number;
  /** 계약명에서 뽑은 구조. */
  structure?: BuildingStructure;
  /** 건물 전체가 아니라 일부만 철거하는 공사. */
  partial: boolean;
}

export function isDemolitionContractName(name: string): boolean {
  return DEMOLITION_CONTRACT_KEYWORDS.some((k) => name.includes(k));
}

export function isPartialDemolition(name: string): boolean {
  return PARTIAL_DEMOLITION_KEYWORDS.some((k) => name.includes(k));
}

function toNumber(text: string): number | undefined {
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * 계약명에서 연면적(㎡)을 뽑는다. "연면적 1,234.5㎡", "(A=850m2)", "120평" 같은 표기를 읽는다.
 * 숫자가 여러 개면 가장 큰 값을 쓴다 — "동별 300㎡, 계 900㎡" 처럼 합계가 가장 크다.
 */
export function parseAreaM2(name: string): number | undefined {
  const values: number[] = [];
  for (const m of name.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:㎡|m²|m2|M2|제곱미터)/g)) {
    const n = toNumber(m[1] ?? '');
    if (n) values.push(n);
  }
  for (const m of name.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*평(?![가-힣])/g)) {
    const n = toNumber(m[1] ?? '');
    if (n) values.push(Math.round(n * SQM_PER_PYEONG * 10) / 10);
  }
  return values.length > 0 ? Math.max(...values) : undefined;
}

/**
 * 계약명에서 구조를 뽑는다. 판정 순서는 건축물대장 매핑(structureCodeOf)과 같다 —
 * 경량철골·판넬은 '철골'을 포함하므로 중량 구조보다 먼저 거른다.
 */
export function parseStructure(name: string): BuildingStructure | undefined {
  const text = name.replace(/\s/g, '');
  if (text.includes('목조') || text.includes('목구조')) return 'WOOD';
  if (/경량철골|판넬|패널/.test(text)) return 'BRICK';
  if (/조적|벽돌|블록|연와/.test(text)) return 'BRICK';
  if (/철근콘크리트|철콘|RC조|철골|콘크리트/.test(text)) return 'RC';
  return undefined;
}

/** ㎡당 단가. 연면적이 없거나 부분 철거거나 범위를 벗어나면 undefined. */
export function contractPricePerSqm(c: PublicDemolitionContract): number | undefined {
  if (c.partial || !c.areaM2) return undefined;
  const perSqm = c.amount / c.areaM2;
  const { min, max } = MARKET_PRICE_SANE_RANGE_PER_SQM;
  return perSqm >= min && perSqm <= max ? Math.round(perSqm) : undefined;
}

/** 정렬된 배열의 분위수(선형 보간). */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? NaN;
  const b = sorted[hi] ?? NaN;
  return a + (b - a) * (pos - lo);
}

export interface PerSqmStats {
  /** 구조 미상은 'UNKNOWN'. */
  structure: BuildingStructure | 'UNKNOWN';
  count: number;
  p25: number;
  median: number;
  p75: number;
}

/**
 * 구조별 ㎡당 철거비 분포. 표본이 [[MARKET_PRICE_MIN_SAMPLES]] 미만인 구조는 결과에서 뺀다.
 * 평균이 아니라 중앙값·사분위를 쓰는 이유: 공공 계약에는 특수 공법·야간 작업 같은
 * 극단값이 섞여 평균을 크게 끌어올린다.
 */
export function summarizePerSqm(contracts: PublicDemolitionContract[]): PerSqmStats[] {
  const groups = new Map<PerSqmStats['structure'], number[]>();
  for (const c of contracts) {
    const v = contractPricePerSqm(c);
    if (v === undefined) continue;
    const key = c.structure ?? 'UNKNOWN';
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  const out: PerSqmStats[] = [];
  for (const [structure, values] of groups) {
    if (values.length < MARKET_PRICE_MIN_SAMPLES) continue;
    const s = [...values].sort((a, b) => a - b);
    out.push({
      structure,
      count: s.length,
      p25: Math.round(quantile(s, 0.25)),
      median: Math.round(quantile(s, 0.5)),
      p75: Math.round(quantile(s, 0.75)),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * 공공 시세 → 민간 시세 보정 계수. 같은 구조의 시범 현장 민간 실견적(㎡당)을
 * 공공 중앙값으로 나눈 값들의 중앙값. 표본이 [[MARKET_PRICE_MIN_SAMPLES]] 미만이면 undefined —
 * 근거 없는 계수를 곱하느니 공공 시세를 "참고 상한"으로만 보여주는 편이 낫다.
 */
export function calibrationFactor(
  privatePerSqm: number[],
  publicMedianPerSqm: number,
): number | undefined {
  if (privatePerSqm.length < MARKET_PRICE_MIN_SAMPLES || !(publicMedianPerSqm > 0))
    return undefined;
  const ratios = privatePerSqm.map((p) => p / publicMedianPerSqm).sort((a, b) => a - b);
  return Math.round(quantile(ratios, 0.5) * 1000) / 1000;
}
