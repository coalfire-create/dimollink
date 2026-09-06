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

/**
 * data.go.kr 은 같은 키를 Encoding(퍼센트 인코딩본)/Decoding(원문) 두 가지로 준다.
 * 어느 쪽을 붙여넣어도 동작하도록, 이미 인코딩된 키는 그대로 쓰고 원문 키만 인코딩한다.
 * (원문을 그대로 쿼리에 붙이면 '+' 가 공백으로 해석돼 인증이 실패한다.)
 */
export function encodeServiceKey(rawKey: string): string {
  const key = rawKey.trim();
  if (/%[0-9A-Fa-f]{2}/.test(key)) return key; // 이미 Encoding 키
  return encodeURIComponent(key);
}

/** 둘 다 없으면 undefined, 하나라도 있으면 합(없는 쪽은 0). */
function sumDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

/** 문자열 필드 정규화 — 공백/빈 문자열은 undefined 로 접어 UI에서 빈 줄이 생기지 않게 한다. */
function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class BuildingRegistryClient {
  // data.go.kr 는 https 를 지원한다. 서비스키가 쿼리로 나가므로 평문(http)으로 보내지 않는다.
  private readonly baseUrl = 'https://apis.data.go.kr/1613000/BldRgstHubService';
  /** 표제부 — 구조·용도·층수·연면적·대지면적·높이·승강기. */
  private readonly endpoint = `${this.baseUrl}/getBrTitleInfo`;
  /** 기본개요 — 용도지역/지구/구역(토지 규제). 표제부에 없어 별도 오퍼레이션으로 받는다. */
  private readonly outlineEndpoint = `${this.baseUrl}/getBrBasisOulnInfo`;
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

  /** 한 오퍼레이션을 호출해 items 배열로 정규화한다(단일 객체·배열·없음 모두 처리). */
  private async fetchItems(
    url: string,
    signal: AbortSignal,
  ): Promise<Array<Record<string, unknown>>> {
    const res = await this.fetchFn(url, { signal });
    if (!res.ok) {
      console.warn(`[BuildingRegistry] API 응답 오류: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      response?: { body?: { items?: { item?: unknown } } };
    };
    const items = data?.response?.body?.items?.item;
    if (!items) return [];
    return (Array.isArray(items) ? items : [items]) as Array<Record<string, unknown>>;
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

      // 2. 공공데이터 API 호출 — 표제부(건물 제원)와 기본개요(토지 용도지역)를 병렬로.
      //    둘을 순차 호출하면 왕복이 2배가 되므로, 하나의 시간 예산 안에서 동시에 받는다.
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
      const query = `serviceKey=${encodeServiceKey(this.apiKey)}&${params.toString()}`;

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        console.warn('[BuildingRegistry] 지오코딩 단계에서 시간 예산 소진');
        return null;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);

      const [titleItems, outlineItems] = await Promise.all([
        this.fetchItems(`${this.endpoint}?${query}`, controller.signal),
        // 용도지역은 보조 정보다. 실패해도 표제부 결과로 진행한다.
        this.fetchItems(`${this.outlineEndpoint}?${query}`, controller.signal).catch(() => []),
      ]).finally(() => clearTimeout(timer));

      if (titleItems.length === 0) {
        this.writeCache(key, null);
        return null;
      }

      // 배열이면 연면적이 가장 큰 동을 주 건물로 본다(부속동보다 본관을 기준으로).
      const item = titleItems
        .slice()
        .sort(
          (a, b) =>
            (num(b.totArea) ?? num(b.vlRatEstmTotArea) ?? 0) -
            (num(a.totArea) ?? num(a.vlRatEstmTotArea) ?? 0),
        )[0];
      if (!item) {
        this.writeCache(key, null);
        return null;
      }

      // 용도지역은 필지 단위라 어느 동에서든 값이 있으면 쓴다(레코드마다 비어 있는 경우가 많다).
      const zoned = outlineItems.find((o) => str(o.jiyukCdNm) ?? str(o.guyukCdNm) ?? str(o.jiguCdNm));

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
        // 토지(대지) 정보
        platArea: num(item.platArea),
        archArea: num(item.archArea),
        bcRat: num(item.bcRat),
        vlRat: num(item.vlRat),
        jiyukCdNm: str(zoned?.jiyukCdNm),
        jiguCdNm: str(zoned?.jiguCdNm),
        guyukCdNm: str(zoned?.guyukCdNm),
        // 해체 계획 제원
        heit: num(item.heit),
        rideUseElvtCnt: num(item.rideUseElvtCnt),
        emgenUseElvtCnt: num(item.emgenUseElvtCnt),
        mechParkingCnt: sumDefined(num(item.indrMechUtcnt), num(item.oudrMechUtcnt)),
      };
      this.writeCache(key, info);
      return info;
    } catch (err) {
      console.warn('[BuildingRegistry] 조회 실패:', err instanceof Error ? err.message : 'error');
      return null;
    }
  }
}
