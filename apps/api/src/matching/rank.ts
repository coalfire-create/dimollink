import {
  PILOT,
  haversineDistanceKm,
  isValidGeoPoint,
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

/** 좌표를 가질 수 있는 항목(일감 등). location 이 없으면 거리 계산에서 제외. */
export interface Located {
  id: string;
  location?: GeoPoint;
}

export interface DistanceRankOptions {
  /** 반경 제한(km). 초과 항목 제외(좌표 없는 항목은 유지). */
  maxRadiusKm?: number;
}

/**
 * origin(업체 기준 좌표)에서 가까운 순으로 항목(일감)을 정렬한다.
 * 거리 기반 매칭을 후보(업체)뿐 아니라 일감 목록에도 재사용하기 위한 범용 정렬기.
 *
 * - origin 이 없거나 유효하지 않으면 거리 없이(distanceKm=null) 입력 순서를 유지한다.
 * - 좌표 없는 항목은 distanceKm=null 로 두고 좌표 있는 항목보다 뒤로 정렬한다.
 * - 도로거리가 아닌 직선거리(하버사인) — Phase 1 기본 매칭 기준.
 */
export function rankByDistance<T extends Located>(
  origin: GeoPoint | undefined,
  items: T[],
  options: DistanceRankOptions = {},
): Array<T & { distanceKm: number | null }> {
  if (!origin || !isValidGeoPoint(origin)) {
    return items.map((item) => ({ ...item, distanceKm: null }));
  }
  return items
    .map((item) => ({
      ...item,
      distanceKm:
        item.location && isValidGeoPoint(item.location)
          ? round3(haversineDistanceKm(origin, item.location))
          : null,
    }))
    .filter(
      (item) =>
        options.maxRadiusKm === undefined ||
        item.distanceKm === null ||
        item.distanceKm <= options.maxRadiusKm,
    )
    .sort((a, b) => {
      // 좌표 있는 항목을 가까운 순으로 앞에, 좌표 없는 항목은 뒤로(결정적).
      if (a.distanceKm === null && b.distanceKm === null) return a.id.localeCompare(b.id);
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm || a.id.localeCompare(b.id);
    });
}
