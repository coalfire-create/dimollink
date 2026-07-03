import type { GeoPoint } from '@dimol/shared';
import { env } from '../config/env.js';

/**
 * 주소 → 좌표 변환(지오코딩). 거리 기반 매칭에 쓸 현장 좌표를 확보한다.
 * 현재 카카오 로컬 API를 지원하며, 미설정 시 NoopGeocoder(항상 null)로 폴백한다.
 */
export interface Geocoder {
  geocode(address: string): Promise<GeoPoint | null>;
}

/** 지오코딩 비활성(좌표 없음) — 설정 전 폴백. */
export class NoopGeocoder implements Geocoder {
  async geocode(): Promise<GeoPoint | null> {
    return null;
  }
}

/** 카카오 로컬 API 기반 주소 지오코더. */
export class KakaoGeocoder implements Geocoder {
  constructor(
    private readonly restKey: string,
    private readonly timeoutMs: number,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async geocode(address: string): Promise<GeoPoint | null> {
    const query = address.trim();
    if (!query) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
      const res = await this.fetchFn(url, {
        headers: { Authorization: `KakaoAK ${this.restKey}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[geocode] 카카오 응답 오류 status=${res.status}`);
        return null;
      }
      const data = (await res.json()) as { documents?: Array<{ x?: string; y?: string }> };
      const doc = data.documents?.[0];
      if (!doc || doc.x === undefined || doc.y === undefined) return null;
      const lng = Number(doc.x);
      const lat = Number(doc.y);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch (err) {
      // 주소는 PII 성격 — 값은 로그에 남기지 않는다.
      console.warn('[geocode] 지오코딩 실패', err instanceof Error ? err.name : 'error');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 환경설정 기반 지오코더. */
export function createGeocoder(fetchFn: typeof fetch = fetch): Geocoder {
  if (env.geocode.provider === 'kakao' && env.geocode.kakaoRestKey) {
    return new KakaoGeocoder(env.geocode.kakaoRestKey, env.geocode.timeoutMs, fetchFn);
  }
  return new NoopGeocoder();
}
