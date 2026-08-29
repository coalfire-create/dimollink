import type { BuildingLedgerInfo } from '@dimol/shared';
import { env } from '../config/env.js';
import { Geocoder, createGeocoder } from './geocoder.js';

export type BuildingInfo = BuildingLedgerInfo;

/** 조회 결과 캐시 TTL — 건축물대장은 거의 바뀌지 않으므로 길게 잡아 왕복을 줄인다. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** 캐시 상한(메모리 보호). 초과 시 가장 오래된 항목부터 버린다. */
const CACHE_MAX_ENTRIES = 500;

interface CacheEntry {
  value: BuildingInfo | null;
  expiresAt: number;
}

/** 숫자 필드 정규화 — 공공데이터는 숫자를 문자열로 주기도 하고 빈 문자열로 주기도 한다. */
function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** 문자열 필드 정규화 — 공백/빈 문자열은 undefined 로 접어 UI에서 빈 줄이 생기지 않게 한다. */
function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class BuildingRegistryClient {
  // data.go.kr 는 https 를 지원한다. 서비스키가 쿼리로 나가므로 평문(http)으로 보내지 않는다.
  private readonly endpoint = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo';
  private geocoder: Geocoder;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly apiKey: string = env.buildingRegistry.apiKey ?? '',
    private readonly timeoutMs: number = env.buildingRegistry.timeoutMs,
    private readonly fetchFn: typeof fetch = fetch,
    geocoder?: Geocoder,
  ) {
    this.geocoder = geocoder ?? createGeocoder(fetchFn);
  }

  private readCache(key: string): CacheEntry | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return hit;
  }

  private writeCache(key: string, value: BuildingInfo | null): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  /**
   * 주소를 기반으로 건축물대장 표제부를 조회한다.
   * 지오코딩(법정동코드·지번) → 대장 조회 2단계이며, 전체 시간을 timeoutMs 예산 안으로 묶는다.
   * 실패는 모두 null 로 접는다 — 대장 정보는 분석 정확도를 높이는 보조 정보이지 차단 조건이 아니다.
   */
  async getBuildingInfo(address: string): Promise<BuildingInfo | null> {
    const key = address.trim();
    if (!key) return null;
    if (!this.apiKey) {
      console.warn('[BuildingRegistry] API 키가 설정되지 않아 조회를 건너뜁니다.');
      return null;
    }

    const cached = this.readCache(key);
    if (cached) return cached.value;

    const deadline = Date.now() + this.timeoutMs;
    try {
      // 1. 주소를 지오코딩하여 법정동코드 및 지번 정보 획득
      const results = await this.geocoder.searchAddress(key);
      const match = results.find((r) => r.bCode && r.mainAddressNo);

      if (!match?.bCode || !match.mainAddressNo) {
        console.warn('[BuildingRegistry] 지번 정보를 찾을 수 없습니다.');
        this.writeCache(key, null);
        return null;
      }

      const sigunguCd = match.bCode.substring(0, 5);
      const bjdongCd = match.bCode.substring(5, 10);
      const platGbCd = match.mountainYn === 'Y' || match.mountainYn === '1' ? '1' : '0'; // 0: 대지, 1: 산
      const bun = match.mainAddressNo.padStart(4, '0');
      const ji = (match.subAddressNo || '0').padStart(4, '0');

      // 2. 공공데이터 API 호출
      const params = new URLSearchParams({
        sigunguCd,
        bjdongCd,
        platGbCd,
        bun,
        ji,
        numOfRows: '10',
        pageNo: '1',
        _type: 'json',
      });
      // serviceKey 는 발급본이 이미 URL 인코딩돼 있을 수 있어 이중 인코딩을 피해 직접 붙인다.
      const url = `${this.endpoint}?serviceKey=${this.apiKey}&${params.toString()}`;

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        console.warn('[BuildingRegistry] 지오코딩 단계에서 시간 예산 소진');
        return null;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);

      const res = await this.fetchFn(url, { signal: controller.signal }).finally(() =>
        clearTimeout(timer),
      );

      if (!res.ok) {
        console.warn(`[BuildingRegistry] API 응답 오류: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as {
        response?: { body?: { items?: { item?: unknown } } };
      };
      const items = data?.response?.body?.items?.item;
      if (!items) {
        this.writeCache(key, null);
        return null;
      }

      // items 는 단일 객체이거나 배열일 수 있다. 배열이면 연면적이 가장 큰 동을 주 건물로 본다.
      const list = (Array.isArray(items) ? items : [items]) as Array<Record<string, unknown>>;
      const item = list
        .slice()
        .sort((a, b) => (num(b.totArea) ?? num(b.vlRatEstmTotArea) ?? 0) - (num(a.totArea) ?? num(a.vlRatEstmTotArea) ?? 0))[0];
      if (!item) {
        this.writeCache(key, null);
        return null;
      }

      const info: BuildingInfo = {
        strctCdNm: str(item.strctCdNm),
        roofCdNm: str(item.roofCdNm),
        etcStrct: str(item.etcStrct),
        vlRatEstmTotArea: num(item.vlRatEstmTotArea),
        totArea: num(item.totArea),
        mainPurpsCdNm: str(item.mainPurpsCdNm),
        grndFlrCnt: num(item.grndFlrCnt),
        ugrndFlrCnt: num(item.ugrndFlrCnt),
        useAprDay: str(item.useAprDay),
        bldNm: str(item.bldNm),
      };
      this.writeCache(key, info);
      return info;
    } catch (err) {
      console.warn('[BuildingRegistry] 조회 실패:', err instanceof Error ? err.message : 'error');
      return null;
    }
  }
}
