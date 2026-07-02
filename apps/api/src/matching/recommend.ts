import {
  resolveMatchWeights,
  type GeoPoint,
  type MatchCandidate,
  type MatchWeights,
  type RankedCandidate,
} from '@dimol/shared';
import { rankCandidatesByDistance, type RankOptions } from './rank.js';

/**
 * 가중치 추천 정렬 (로드맵 Phase 3 · 매칭 알고리즘 고도화).
 *
 * 거리(가까울수록)·견적가(낮을수록)·평점(높을수록)을 후보군 내에서 0~1로 정규화한 뒤
 * 가중 합산해 추천 점수를 만든다. 필터(파일럿 지역/카테고리/반경)와 거리 계산은
 * Phase 1 거리 정렬(rank.ts)을 재사용한다.
 *
 * - 견적가/평점이 없는 후보는 해당 축을 중립(0.5)으로 둔다 — 정보 없음이 유불리로
 *   작용하지 않게 한다.
 * - 후보군 내 값이 전부 같은 축도 중립 처리한다.
 */

export interface RecommendCandidate extends MatchCandidate {
  /** 견적가(원). 견적 없는 후보는 생략. */
  price?: number;
  /** 평균 평점 1~5 (리뷰 없으면 null/생략). */
  rating?: number | null;
}

export interface RecommendedCandidate extends RankedCandidate {
  price?: number;
  rating?: number | null;
  /** 가중 합산 점수 0~1 (높을수록 추천). */
  score: number;
}

export interface RecommendOptions extends RankOptions {
  weights?: Partial<MatchWeights>;
}

const NEUTRAL = 0.5;

/** 후보군 내 min-max 정규화. 값이 없거나 전부 같으면 중립. */
function normalizer(values: Array<number | undefined>): (value: number | undefined) => number {
  const present = values.filter((v): v is number => v !== undefined);
  const min = Math.min(...present);
  const max = Math.max(...present);
  return (value) => (value === undefined || max === min ? NEUTRAL : (value - min) / (max - min));
}

export function recommendCandidates(
  origin: GeoPoint,
  candidates: RecommendCandidate[],
  options: RecommendOptions = {},
): RecommendedCandidate[] {
  const weights = resolveMatchWeights(options.weights);

  // 필터·거리 계산은 거리 정렬 재사용 (limit 은 점수 정렬 후에 적용).
  const ranked = rankCandidatesByDistance(origin, candidates, {
    ...options,
    limit: undefined,
  }) as Array<RankedCandidate & Pick<RecommendCandidate, 'price' | 'rating'>>;

  const normDistance = normalizer(ranked.map((c) => c.distanceKm));
  const normPrice = normalizer(ranked.map((c) => c.price));
  const normRating = normalizer(ranked.map((c) => c.rating ?? undefined));

  const scored = ranked
    .map<RecommendedCandidate>((c) => ({
      ...c,
      score:
        Math.round(
          (weights.distance * (1 - normDistance(c.distanceKm)) +
            weights.price * (1 - normPrice(c.price)) +
            weights.rating * normRating(c.rating ?? undefined)) *
            1000,
        ) / 1000,
    }))
    // 점수 높은 순. 동점은 가까운 순 → id (결정적).
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));

  return options.limit === undefined ? scored : scored.slice(0, Math.max(0, options.limit));
}
