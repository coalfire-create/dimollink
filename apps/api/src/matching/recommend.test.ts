import { DEFAULT_MATCH_WEIGHTS, resolveMatchWeights, type GeoPoint } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { recommendCandidates, type RecommendCandidate } from './recommend.js';

// 양평군청 인근을 배출 현장으로 가정.
const origin: GeoPoint = { lat: 37.4917, lng: 127.4875 };

function candidate(
  id: string,
  latOffset: number,
  extra: Partial<RecommendCandidate> = {},
): RecommendCandidate {
  return {
    id,
    role: 'TRANSPORT',
    region: '양평',
    location: { lat: origin.lat + latOffset, lng: origin.lng },
    wasteCategories: ['CONSTRUCTION'],
    ...extra,
  };
}

describe('resolveMatchWeights', () => {
  it('기본 가중치 합은 1 (거리 우선)', () => {
    const w = resolveMatchWeights();
    expect(w.distance + w.price + w.rating).toBeCloseTo(1);
    expect(w).toEqual(DEFAULT_MATCH_WEIGHTS);
  });

  it('부분 가중치는 기본값과 합쳐 정규화', () => {
    const w = resolveMatchWeights({ distance: 1, price: 1, rating: 0 });
    expect(w).toEqual({ distance: 0.5, price: 0.5, rating: 0 });
  });

  it('음수·합 0 거부', () => {
    expect(() => resolveMatchWeights({ distance: -1 })).toThrow();
    expect(() => resolveMatchWeights({ distance: 0, price: 0, rating: 0 })).toThrow();
  });
});

describe('recommendCandidates — 가중치 추천 정렬', () => {
  it('기본 가중치(거리 0.5)에서는 가까운 후보가 앞선다', () => {
    const near = candidate('near', 0.01);
    const far = candidate('far', 0.3);
    const result = recommendCandidates(origin, [far, near]);
    expect(result.map((c) => c.id)).toEqual(['near', 'far']);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('가격 가중치만 주면 싼 후보가 먼 거리라도 앞선다', () => {
    const nearExpensive = candidate('near-exp', 0.01, { price: 10_000_000 });
    const farCheap = candidate('far-cheap', 0.3, { price: 6_000_000 });
    const result = recommendCandidates(origin, [nearExpensive, farCheap], {
      weights: { distance: 0, price: 1, rating: 0 },
    });
    expect(result[0].id).toBe('far-cheap');
  });

  it('평점 가중치만 주면 평점 높은 후보가 앞선다', () => {
    const lowRated = candidate('low', 0.01, { rating: 2.5 });
    const highRated = candidate('high', 0.3, { rating: 4.8 });
    const result = recommendCandidates(origin, [lowRated, highRated], {
      weights: { distance: 0, price: 0, rating: 1 },
    });
    expect(result[0].id).toBe('high');
  });

  it('평점 없는 후보는 중립(0.5) — 최하위로 밀리지 않는다', () => {
    const noRating = candidate('none', 0.05);
    const worst = candidate('worst', 0.05, { rating: 1 });
    const best = candidate('best', 0.05, { rating: 5 });
    const result = recommendCandidates(origin, [worst, noRating, best], {
      weights: { distance: 0, price: 0, rating: 1 },
    });
    expect(result.map((c) => c.id)).toEqual(['best', 'none', 'worst']);
  });

  it('파일럿 필터·반경 제한은 거리 정렬과 동일하게 적용', () => {
    const outsideRegion = candidate('seoul', 0.01, { region: '서울' });
    const tooFar = candidate('too-far', 1.0);
    const ok = candidate('ok', 0.01);
    const result = recommendCandidates(origin, [outsideRegion, tooFar, ok], {
      maxRadiusKm: 30,
    });
    expect(result.map((c) => c.id)).toEqual(['ok']);
  });

  it('동점이면 가까운 순 → id 순 (결정적)', () => {
    const a = candidate('b-far', 0.02);
    const b = candidate('a-near', 0.01);
    // 거리 가중치 0 → 두 후보 모두 중립 점수 동점.
    const result = recommendCandidates(origin, [a, b], {
      weights: { distance: 0, price: 1, rating: 0 },
    });
    expect(result.map((c) => c.id)).toEqual(['a-near', 'b-far']);
  });

  it('limit 은 점수 정렬 후 적용', () => {
    const cheap = candidate('cheap', 0.2, { price: 1_000_000 });
    const near = candidate('near', 0.01, { price: 9_000_000 });
    const result = recommendCandidates(origin, [near, cheap], {
      weights: { distance: 0, price: 1, rating: 0 },
      limit: 1,
    });
    expect(result.map((c) => c.id)).toEqual(['cheap']);
  });
});
