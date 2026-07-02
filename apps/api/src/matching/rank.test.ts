import type { MatchCandidate } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { rankCandidatesByDistance } from './rank.js';

// 배출 현장(양평 인근) 기준.
const ORIGIN = { lat: 37.49, lng: 127.49 };

function candidate(over: Partial<MatchCandidate> & { id: string }): MatchCandidate {
  return {
    role: 'TRANSPORT',
    region: '양평',
    location: { lat: 37.49, lng: 127.49 },
    wasteCategories: ['CONSTRUCTION'],
    active: true,
    ...over,
  };
}

describe('rankCandidatesByDistance', () => {
  it('가까운 순으로 정렬한다', () => {
    const near = candidate({ id: 'near', location: { lat: 37.5, lng: 127.5 } });
    const far = candidate({ id: 'far', location: { lat: 37.8, lng: 127.9 } });
    const mid = candidate({ id: 'mid', location: { lat: 37.6, lng: 127.6 } });

    const ranked = rankCandidatesByDistance(ORIGIN, [far, near, mid]);
    expect(ranked.map((c) => c.id)).toEqual(['near', 'mid', 'far']);
    // 거리 오름차순.
    expect(ranked[0]!.distanceKm).toBeLessThan(ranked[1]!.distanceKm);
    expect(ranked[1]!.distanceKm).toBeLessThan(ranked[2]!.distanceKm);
  });

  it('파일럿 지역(양평) 밖 후보는 제외', () => {
    const seoul = candidate({ id: 'seoul', region: '서울' });
    const yangpyeong = candidate({ id: 'yp', region: '양평' });
    const ranked = rankCandidatesByDistance(ORIGIN, [seoul, yangpyeong]);
    expect(ranked.map((c) => c.id)).toEqual(['yp']);
  });

  it('건설폐기물을 취급하지 않는 후보는 제외', () => {
    const other = candidate({ id: 'other', wasteCategories: [] });
    const ok = candidate({ id: 'ok' });
    const ranked = rankCandidatesByDistance(ORIGIN, [other, ok]);
    expect(ranked.map((c) => c.id)).toEqual(['ok']);
  });

  it('비활성(active:false) 후보는 제외', () => {
    const inactive = candidate({ id: 'inactive', active: false });
    const active = candidate({ id: 'active' });
    const ranked = rankCandidatesByDistance(ORIGIN, [inactive, active]);
    expect(ranked.map((c) => c.id)).toEqual(['active']);
  });

  it('role 지정 시 해당 유형만', () => {
    const t = candidate({ id: 't', role: 'TRANSPORT' });
    const d = candidate({ id: 'd', role: 'DISPOSAL' });
    const ranked = rankCandidatesByDistance(ORIGIN, [t, d], { role: 'DISPOSAL' });
    expect(ranked.map((c) => c.id)).toEqual(['d']);
  });

  it('maxRadiusKm 초과 후보는 제외', () => {
    const near = candidate({ id: 'near', location: { lat: 37.5, lng: 127.5 } });
    const far = candidate({ id: 'far', location: { lat: 38.5, lng: 128.5 } });
    const ranked = rankCandidatesByDistance(ORIGIN, [near, far], { maxRadiusKm: 20 });
    expect(ranked.map((c) => c.id)).toEqual(['near']);
  });

  it('limit으로 상위 N개만 반환', () => {
    const a = candidate({ id: 'a', location: { lat: 37.5, lng: 127.5 } });
    const b = candidate({ id: 'b', location: { lat: 37.6, lng: 127.6 } });
    const c = candidate({ id: 'c', location: { lat: 37.7, lng: 127.7 } });
    const ranked = rankCandidatesByDistance(ORIGIN, [a, b, c], { limit: 2 });
    expect(ranked.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('동일 거리는 id로 결정적 정렬', () => {
    const loc = { lat: 37.55, lng: 127.55 };
    const b = candidate({ id: 'b', location: loc });
    const a = candidate({ id: 'a', location: loc });
    const ranked = rankCandidatesByDistance(ORIGIN, [b, a]);
    expect(ranked.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('결과에 distanceKm가 포함된다', () => {
    const ranked = rankCandidatesByDistance(ORIGIN, [candidate({ id: 'x' })]);
    expect(ranked[0]).toHaveProperty('distanceKm');
    expect(ranked[0]!.distanceKm).toBe(0); // origin과 동일 좌표
  });
});
