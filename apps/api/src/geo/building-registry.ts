import { env } from '../config/env.js';
import { Geocoder, createGeocoder } from './geocoder.js';

export interface BuildingInfo {
  strctCdNm?: string; // 주구조 (예: 철근콘크리트구조)
  roofCdNm?: string; // 지붕 (예: (철근)콘크리트)
  etcStrct?: string; // 기타구조
  vlRatEstmTotArea?: number; // 용적률산정연면적(m2)
  mainPurpsCdNm?: string; // 주용도 (예: 제1종근린생활시설)
  grndFlrCnt?: number; // 지상층수
  ugrndFlrCnt?: number; // 지하층수
  useAprDay?: string; // 사용승인일 (YYYYMMDD)
}

export class BuildingRegistryClient {
  private readonly endpoint = 'http://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo';
  private geocoder: Geocoder;

  constructor(
    private readonly apiKey: string = env.buildingRegistry.apiKey ?? '',
    private readonly timeoutMs: number = env.buildingRegistry.timeoutMs,
    private readonly fetchFn: typeof fetch = fetch
  ) {
    this.geocoder = createGeocoder(fetchFn);
  }

  /**
   * 주소를 기반으로 건축물대장 표제부를 조회한다.
   */
  async getBuildingInfo(address: string): Promise<BuildingInfo | null> {
    if (!this.apiKey) {
      console.warn('[BuildingRegistry] API 키가 설정되지 않아 조회를 건너뜁니다.');
      return null;
    }

    try {
      // 1. 주소를 지오코딩하여 법정동코드 및 지번 정보 획득
      const results = await this.geocoder.searchAddress(address);
      const match = results.find(r => r.bCode && r.mainAddressNo);
      
      if (!match || !match.bCode || !match.mainAddressNo) {
        console.warn(`[BuildingRegistry] 지번 정보를 찾을 수 없습니다: ${address}`);
        return null;
      }

      const sigunguCd = match.bCode.substring(0, 5);
      const bjdongCd = match.bCode.substring(5, 10);
      const platGbCd = match.mountainYn === 'Y' ? '1' : '0'; // 0: 대지, 1: 산, 2: 블록
      const bun = match.mainAddressNo.padStart(4, '0');
      const ji = (match.subAddressNo || '0').padStart(4, '0');

      // 2. 공공데이터 API 호출
      const url = new URL(this.endpoint);
      url.searchParams.append('serviceKey', this.apiKey);
      url.searchParams.append('sigunguCd', sigunguCd);
      url.searchParams.append('bjdongCd', bjdongCd);
      url.searchParams.append('platGbCd', platGbCd);
      url.searchParams.append('bun', bun);
      url.searchParams.append('ji', ji);
      url.searchParams.append('numOfRows', '10');
      url.searchParams.append('pageNo', '1');
      url.searchParams.append('_type', 'json');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await this.fetchFn(url.toString(), {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        console.warn(`[BuildingRegistry] API 응답 오류: ${res.status}`);
        return null;
      }

      const data = await res.json() as any;
      const items = data?.response?.body?.items?.item;
      
      if (!items) {
        return null;
      }

      // items는 단일 객체이거나 배열일 수 있음
      const item = Array.isArray(items) ? items[0] : items;
      if (!item) return null;

      return {
        strctCdNm: item.strctCdNm,
        roofCdNm: item.roofCdNm,
        etcStrct: item.etcStrct,
        vlRatEstmTotArea: item.vlRatEstmTotArea ? Number(item.vlRatEstmTotArea) : undefined,
        mainPurpsCdNm: item.mainPurpsCdNm,
        grndFlrCnt: item.grndFlrCnt ? Number(item.grndFlrCnt) : undefined,
        ugrndFlrCnt: item.ugrndFlrCnt ? Number(item.ugrndFlrCnt) : undefined,
        useAprDay: item.useAprDay,
      };

    } catch (err) {
      console.warn('[BuildingRegistry] 조회 실패:', err instanceof Error ? err.message : 'error');
      return null;
    }
  }
}
