import { describe, expect, it } from 'vitest';
import { BuildingRegistryClient } from './building-registry.js';
import type { AddressSearchResult, Geocoder } from './geocoder.js';

/**
 * 건축물대장 조회 클라이언트 — 주소 → 지번 → 공공데이터 표제부.
 * 왕복이 2단계라 캐시·타임아웃 예산·키 인코딩이 실사용 성능과 성공률을 좌우한다.
 */

const MATCH: AddressSearchResult = {
  addressName: '경기 양평군 양평읍 양근리 120-5',
  roadAddressName: '경기 양평군 양평읍 양근강변길 12',
  region: '경기 양평',
  bCode: '4183025021',
  mountainYn: 'N',
  mainAddressNo: '120',
  subAddressNo: '5',
};

function stubGeocoder(result: AddressSearchResult[] = [MATCH]): Geocoder {
  return {
    geocode: async () => null,
    searchAddress: async () => result,
    reverseGeocode: async () => null,
  };
}

function jsonResponse(item: unknown): Response {
  return new Response(JSON.stringify({ response: { body: { items: { item } } } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function client(
  item: unknown,
  opts: { geocoder?: Geocoder; apiKey?: string } = {},
): { instance: BuildingRegistryClient; urls: string[] } {
  const urls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return jsonResponse(item);
  }) as typeof fetch;
  return {
    instance: new BuildingRegistryClient(
      opts.apiKey ?? 'TEST_KEY',
      5_000,
      fetchFn,
      opts.geocoder ?? stubGeocoder(),
    ),
    urls,
  };
}

const TITLE_ITEM = {
  strctCdNm: '철근콘크리트구조',
  roofCdNm: '(철근)콘크리트',
  etcStrct: '  ',
  mainPurpsCdNm: '제2종근린생활시설',
  grndFlrCnt: '3',
  ugrndFlrCnt: '1',
  totArea: '480.55',
  vlRatEstmTotArea: '430.1',
  useAprDay: '20150312',
  bldNm: '양근빌딩',
};

describe('BuildingRegistryClient', () => {
  it('표제부 항목을 정규화해 반환한다(문자열 숫자·공백 처리)', async () => {
    const { instance } = client(TITLE_ITEM);
    const info = await instance.getBuildingInfo('경기 양평군 양평읍 양근리 120-5');
    expect(info).toEqual({
      strctCdNm: '철근콘크리트구조',
      roofCdNm: '(철근)콘크리트',
      etcStrct: undefined,
      vlRatEstmTotArea: 430.1,
      totArea: 480.55,
      mainPurpsCdNm: '제2종근린생활시설',
      grndFlrCnt: 3,
      ugrndFlrCnt: 1,
      useAprDay: '20150312',
      bldNm: '양근빌딩',
    });
  });

  it('https 로 호출하고 지번을 4자리로 패딩한다', async () => {
    const { instance, urls } = client(TITLE_ITEM);
    await instance.getBuildingInfo('경기 양평군 양평읍 양근리 120-5');
    expect(urls[0]).toMatch(/^https:\/\/apis\.data\.go\.kr\//);
    expect(urls[0]).toContain('sigunguCd=41830');
    expect(urls[0]).toContain('bjdongCd=25021');
    expect(urls[0]).toContain('bun=0120');
    expect(urls[0]).toContain('ji=0005');
    expect(urls[0]).toContain('platGbCd=0');
  });

  it('서비스키를 다시 인코딩하지 않는다(발급본 이중 인코딩 방지)', async () => {
    const encodedKey = 'abc%2Bdef%3D%3D';
    const { instance, urls } = client(TITLE_ITEM, { apiKey: encodedKey });
    await instance.getBuildingInfo('경기 양평군 양평읍 양근리 120-5');
    expect(urls[0]).toContain(`serviceKey=${encodedKey}`);
  });

  it('산 번지는 platGbCd=1 로 조회한다', async () => {
    const { instance, urls } = client(TITLE_ITEM, {
      geocoder: stubGeocoder([{ ...MATCH, mountainYn: 'Y' }]),
    });
    await instance.getBuildingInfo('산 번지 현장');
    expect(urls[0]).toContain('platGbCd=1');
  });

  it('같은 주소는 캐시로 재사용해 왕복을 반복하지 않는다', async () => {
    const { instance, urls } = client(TITLE_ITEM);
    await instance.getBuildingInfo('경기 양평군 양평읍 양근리 120-5');
    await instance.getBuildingInfo('  경기 양평군 양평읍 양근리 120-5  ');
    expect(urls).toHaveLength(1);
  });

  it('여러 동이 조회되면 연면적이 가장 큰 동을 주 건물로 본다', async () => {
    const { instance } = client([
      { ...TITLE_ITEM, bldNm: '부속창고', totArea: '30' },
      { ...TITLE_ITEM, bldNm: '본관', totArea: '900' },
    ]);
    const info = await instance.getBuildingInfo('경기 양평군 양평읍 양근리 120-5');
    expect(info?.bldNm).toBe('본관');
  });

  it('지번을 못 찾으면 공공API 를 호출하지 않고 null', async () => {
    const { instance, urls } = client(TITLE_ITEM, {
      geocoder: stubGeocoder([{ ...MATCH, bCode: undefined, mainAddressNo: undefined }]),
    });
    expect(await instance.getBuildingInfo('알 수 없는 곳')).toBeNull();
    expect(urls).toHaveLength(0);
  });

  it('API 키가 없으면 조회를 건너뛴다(촬영 흐름은 계속된다)', async () => {
    const { instance, urls } = client(TITLE_ITEM, { apiKey: '' });
    expect(await instance.getBuildingInfo('경기 양평군 양평읍 양근리 120-5')).toBeNull();
    expect(urls).toHaveLength(0);
  });

  it('업스트림 오류는 null 로 접는다(분석 차단하지 않음)', async () => {
    const failing = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    const instance = new BuildingRegistryClient('TEST_KEY', 5_000, failing, stubGeocoder());
    expect(await instance.getBuildingInfo('경기 양평군 양평읍 양근리 120-5')).toBeNull();
  });

  it('빈 주소는 호출 없이 null', async () => {
    const { instance, urls } = client(TITLE_ITEM);
    expect(await instance.getBuildingInfo('   ')).toBeNull();
    expect(urls).toHaveLength(0);
  });
});
