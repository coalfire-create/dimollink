import type { GeoPoint } from '@dimol/shared';
import { env } from '../config/env.js';

/**
 * 주소 → 좌표 변환(지오코딩). 거리 기반 매칭에 쓸 현장 좌표를 확보한다.
 * 현재 카카오 로컬 API를 지원하며, 미설정 시 NoopGeocoder(항상 null)로 폴백한다.
 */
export interface AddressSearchResult {
  addressName: string;
  roadAddressName: string;
  buildingName?: string;
  region: string;
  location?: GeoPoint;
}

export interface Geocoder {
  geocode(address: string): Promise<GeoPoint | null>;
  searchAddress(query: string): Promise<AddressSearchResult[]>;
}

function extractRegion(fullAddress: string): string {
  const parts = fullAddress.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const p0 = parts[0].replace(/특별시|광역시|특별자치시|특별자치도|도/, '');
    const p1 = parts[1].replace(/시|군|구/, '');
    return `${p0} ${p1}`.trim();
  }
  return parts[0] ?? '양평';
}

const MOCK_ADDRESSES: AddressSearchResult[] = [
  {
    addressName: '경기 양평군 양평읍 양근리 120-5',
    roadAddressName: '경기 양평군 양평읍 양근강변길 12',
    buildingName: '양평군청 인근 상가',
    region: '경기 양평',
    location: { lat: 37.4912, lng: 127.4875 },
  },
  {
    addressName: '경기 양평군 강상면 병산리 450',
    roadAddressName: '경기 양평군 강상면 강남로 102',
    buildingName: '병산리 단독주택',
    region: '경기 양평',
    location: { lat: 37.4789, lng: 127.4921 },
  },
  {
    addressName: '경기 양평군 옥천면 신복리 77',
    roadAddressName: '경기 양평군 옥천면 신복길 45',
    buildingName: '옥천 사무실 타운',
    region: '경기 양평',
    location: { lat: 37.5123, lng: 127.4589 },
  },
  {
    addressName: '경기 양평군 용문면 다문리 88',
    roadAddressName: '경기 양평군 용문면 용문산로 15',
    buildingName: '용문역 상업지구',
    region: '경기 양평',
    location: { lat: 37.4856, lng: 127.5942 },
  },
  {
    addressName: '서울 강남구 역삼동 820-1',
    roadAddressName: '서울 강남구 테헤란로 152',
    buildingName: '강남 파이낸스 센터',
    region: '서울 강남',
    location: { lat: 37.5002, lng: 127.0364 },
  },
];

/** 지오코딩 비활성(좌표 없음) — 모크 검색 폴백. */
export class NoopGeocoder implements Geocoder {
  async geocode(): Promise<GeoPoint | null> {
    return null;
  }

  async searchAddress(query: string): Promise<AddressSearchResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return MOCK_ADDRESSES.slice(0, 3);
    const filtered = MOCK_ADDRESSES.filter(
      (item) =>
        item.addressName.toLowerCase().includes(q) ||
        item.roadAddressName.toLowerCase().includes(q) ||
        (item.buildingName && item.buildingName.toLowerCase().includes(q)),
    );
    if (filtered.length > 0) return filtered;
    return [
      {
        addressName: query.trim(),
        roadAddressName: query.trim(),
        region: extractRegion(query),
        location: { lat: 37.4912, lng: 127.4875 },
      },
    ];
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
      console.warn('[geocode] 지오코딩 실패', err instanceof Error ? err.name : 'error');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async searchAddress(query: string): Promise<AddressSearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // 주소 검색 API & 키워드(장소) 검색 API 조인
      const addrUrl = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=5`;
      const keyUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`;
      const [addrRes, keyRes] = await Promise.allSettled([
        this.fetchFn(addrUrl, {
          headers: { Authorization: `KakaoAK ${this.restKey}` },
          signal: controller.signal,
        }),
        this.fetchFn(keyUrl, {
          headers: { Authorization: `KakaoAK ${this.restKey}` },
          signal: controller.signal,
        }),
      ]);

      const results: AddressSearchResult[] = [];

      if (addrRes.status === 'fulfilled' && addrRes.value.ok) {
        const data = (await addrRes.value.json()) as {
          documents?: Array<{
            address_name?: string;
            road_address?: { address_name?: string; building_name?: string };
            address?: { address_name?: string };
            x?: string;
            y?: string;
          }>;
        };
        for (const doc of data.documents ?? []) {
          const mainAddr = doc.road_address?.address_name || doc.address_name || '';
          if (!mainAddr) continue;
          results.push({
            addressName: doc.address?.address_name || doc.address_name || mainAddr,
            roadAddressName: doc.road_address?.address_name || mainAddr,
            buildingName: doc.road_address?.building_name || undefined,
            region: extractRegion(mainAddr),
            location: doc.x && doc.y ? { lat: Number(doc.y), lng: Number(doc.x) } : undefined,
          });
        }
      }

      if (keyRes.status === 'fulfilled' && keyRes.value.ok) {
        const data = (await keyRes.value.json()) as {
          documents?: Array<{
            place_name?: string;
            road_address_name?: string;
            address_name?: string;
            x?: string;
            y?: string;
          }>;
        };
        for (const doc of data.documents ?? []) {
          const mainAddr = doc.road_address_name || doc.address_name || '';
          if (!mainAddr) continue;
          if (results.some((r) => r.roadAddressName === mainAddr)) continue;
          results.push({
            addressName: doc.address_name || mainAddr,
            roadAddressName: doc.road_address_name || mainAddr,
            buildingName: doc.place_name || undefined,
            region: extractRegion(mainAddr),
            location: doc.x && doc.y ? { lat: Number(doc.y), lng: Number(doc.x) } : undefined,
          });
        }
      }

      if (results.length > 0) return results;
      return new NoopGeocoder().searchAddress(query);
    } catch (err) {
      console.warn('[searchAddress] 카카오 검색 실패', err instanceof Error ? err.name : 'error');
      return new NoopGeocoder().searchAddress(query);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 환경설정 기반 지오코더. */
export function createGeocoder(fetchFn: typeof fetch = fetch): Geocoder {
  if (env.geocode.kakaoRestKey || env.geocode.provider === 'kakao') {
    return new KakaoGeocoder(env.geocode.kakaoRestKey ?? '', env.geocode.timeoutMs, fetchFn);
  }
  return new NoopGeocoder();
}
