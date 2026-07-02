import {
  PILOT,
  haversineDistanceKm,
  type GeoPoint,
  type MatchCandidate,
  type ProviderRole,
  type RankedCandidate,
  type WasteCategory,
} from '@dimol/shared';

/**
 * 거리 기반 "기본" 매칭 로직 (로드맵 Phase 1 · 핵심 매칭 플로우).
 *
 * 배출 현장(origin) 좌표에서 가까운 순으로 운반업체/처리장 후보를 정렬한다.
 * 파일럿 범위(양평 지역 · 건설폐기물)를 필터로 강제하며, 범위를 벗어난 후보는 제외한다.
 *
 * ⚠️ 거리+가격+평점 가중치 조합 정렬, 자동 재매칭/타임아웃 등 "매칭 알고리즘 고도화"는
 *   로드맵 Phase 3 항목이므로 여기서 만들지 않는다. 여기서는 순수 거리순만 다룬다.
 */

export interface RankOptions {
  /** 특정 셀러 유형만(운반/처리). 미지정 시 모두. */
  role?: ProviderRole;
  /** 매칭 지역. 기본값은 파일럿 지역(양평). */
  region?: string;
  /** 폐기물 카테고리. 기본값은 파일럿 카테고리(건설폐기물). */
  wasteCategory?: WasteCategory;
  /** 반경 제한(km). 초과 후보 제외. */
  maxRadiusKm?: number;
  /** 상위 N개만 반환. */
  limit?: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function rankCandidatesByDistance(
  origin: GeoPoint,
  candidates: MatchCandidate[],
  options: RankOptions = {},
): RankedCandidate[] {
  const region = options.region ?? PILOT.region;
  const wasteCategory: WasteCategory = options.wasteCategory ?? PILOT.wasteCategory;

  const ranked = candidates
    .filter((c) => c.active !== false)
    .filter((c) => (options.role ? c.role === options.role : true))
    .filter((c) => c.region === region)
    .filter((c) => c.wasteCategories.includes(wasteCategory))
    .map<RankedCandidate>((c) => ({
      ...c,
      distanceKm: round3(haversineDistanceKm(origin, c.location)),
    }))
    .filter((c) => options.maxRadiusKm === undefined || c.distanceKm <= options.maxRadiusKm)
    // 가까운 순. 동일 거리는 id로 안정 정렬(결정적).
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));

  return options.limit === undefined ? ranked : ranked.slice(0, Math.max(0, options.limit));
}
