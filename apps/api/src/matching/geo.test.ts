import { haversineDistanceKm, isValidGeoPoint } from '@dimol/shared';
import { describe, expect, it } from 'vitest';

describe('haversineDistanceKm', () => {
  it('같은 좌표는 거리 0', () => {
    expect(haversineDistanceKm({ lat: 37.49, lng: 127.49 }, { lat: 37.49, lng: 127.49 })).toBe(0);
  });

  it('위도 1도 차이는 약 111km', () => {
    const d = haversineDistanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110.5);
    expect(d).toBeLessThan(111.7);
  });

  it('서울-부산 대략 325km (실측 근사)', () => {
    const seoul = { lat: 37.5665, lng: 126.978 };
    const busan = { lat: 35.1796, lng: 129.0756 };
    const d = haversineDistanceKm(seoul, busan);
    expect(d).toBeGreaterThan(315);
    expect(d).toBeLessThan(335);
  });

  it('대칭성: a→b == b→a', () => {
    const a = { lat: 37.49, lng: 127.49 };
    const b = { lat: 37.6, lng: 127.6 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 9);
  });

  it('유효하지 않은 좌표는 예외', () => {
    expect(() => haversineDistanceKm({ lat: 91, lng: 0 }, { lat: 0, lng: 0 })).toThrow();
    expect(() => haversineDistanceKm({ lat: 0, lng: 181 }, { lat: 0, lng: 0 })).toThrow();
    expect(() => haversineDistanceKm({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 })).toThrow();
  });
});

describe('isValidGeoPoint', () => {
  it('경계값 검증', () => {
    expect(isValidGeoPoint({ lat: 90, lng: 180 })).toBe(true);
    expect(isValidGeoPoint({ lat: -90, lng: -180 })).toBe(true);
    expect(isValidGeoPoint({ lat: 90.1, lng: 0 })).toBe(false);
  });
});
