import { describe, expect, it, vi } from 'vitest';
import {
  calibrationFactor,
  publicPriceReference,
  summarizePerSqmByBand,
  contractPricePerSqm,
  parseAreaM2,
  parseStructure,
  summarizePerSqm,
  type PublicDemolitionContract,
} from '@dimol/shared';
import {
  G2bContractClient,
  dedupeContracts,
  firstPackedName,
  normalizeContract,
} from './g2b-client.js';
import { monthWindows } from './collect.js';

function contract(over: Partial<PublicDemolitionContract>): PublicDemolitionContract {
  return { id: 'x', name: '철거공사', amount: 100_000_000, partial: false, ...over };
}

describe('계약명 파싱', () => {
  it('㎡·m2·평 표기를 읽고 가장 큰 값을 쓴다', () => {
    expect(parseAreaM2('구 청사 철거공사(연면적 1,234.5㎡)')).toBe(1234.5);
    expect(parseAreaM2('창고 해체(A=850m2)')).toBe(850);
    expect(parseAreaM2('관사 철거 120평')).toBeCloseTo(396.7, 1);
    expect(parseAreaM2('동별 300㎡, 계 900㎡ 철거')).toBe(900);
    expect(parseAreaM2('노후 관사 철거공사')).toBeUndefined();
  });

  it('구조: 경량철골·판넬은 철골보다 먼저 가벼운 구조로 본다', () => {
    expect(parseStructure('철근콘크리트조 교사 철거')).toBe('RC');
    expect(parseStructure('경량철골조 창고 해체')).toBe('BRICK');
    expect(parseStructure('조적조 관사 철거')).toBe('BRICK');
    expect(parseStructure('목조 주택 멸실')).toBe('WOOD');
    expect(parseStructure('구 청사 철거')).toBeUndefined();
  });
});

describe('나라장터 원본 정규화', () => {
  it('철거 계약만 남기고 필드를 맞춘다', () => {
    const c = normalizeContract({
      untyCntrctNo: 'R25A0001',
      cnstwkNm: '○○초 철근콘크리트조 별관 철거공사(연면적 600㎡)',
      thtmCntrctAmt: '90,000,000',
      cntrctCnclsDate: '20250314',
      dminsttList: '[1^7012345^경기도교육청^...]',
    });
    expect(c).toEqual({
      id: 'R25A0001',
      name: '○○초 철근콘크리트조 별관 철거공사(연면적 600㎡)',
      amount: 90_000_000,
      contractDate: '2025-03-14',
      agency: '경기도교육청',
      areaM2: 600,
      structure: 'RC',
      partial: false,
    });
  });

  it('철거가 아니거나 금액이 없으면 버린다', () => {
    expect(normalizeContract({ cntrctNm: '도로 포장공사', thtmCntrctAmt: '1000' })).toBeNull();
    expect(normalizeContract({ cntrctNm: '창고 철거', thtmCntrctAmt: '' })).toBeNull();
  });

  it('석면·내부 철거는 부분 철거로 표시한다', () => {
    expect(
      normalizeContract({ cntrctNm: '본관 석면 해체공사', thtmCntrctAmt: '5000000' })?.partial,
    ).toBe(true);
  });

  it('묶음 필드에서 첫 기관명을 꺼낸다', () => {
    expect(firstPackedName('[1^123^양평군^A][2^456^경기도^B]')).toBe('양평군');
    expect(firstPackedName('')).toBeUndefined();
  });

  it('변경 차수가 여러 개면 마지막 금액을 쓴다', () => {
    const out = dedupeContracts([
      contract({ id: 'A', amount: 100 }),
      contract({ id: 'A', amount: 120 }),
      contract({ id: 'B' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.id === 'A')?.amount).toBe(120);
  });
});

describe('㎡당 단가 통계', () => {
  it('부분 철거·연면적 없음·비정상 단가는 뺀다', () => {
    expect(contractPricePerSqm(contract({ areaM2: 1000 }))).toBe(100_000);
    expect(contractPricePerSqm(contract({ areaM2: 1000, partial: true }))).toBeUndefined();
    expect(contractPricePerSqm(contract({}))).toBeUndefined();
    expect(contractPricePerSqm(contract({ areaM2: 1 }))).toBeUndefined();
  });

  it('구조별 중앙값·사분위, 표본 5건 미만 구조는 뺀다', () => {
    const rc = [80, 90, 100, 110, 120].map((k, i) =>
      contract({ id: `rc${i}`, structure: 'RC', areaM2: 1000, amount: k * 1_000_000 }),
    );
    const wood = [contract({ id: 'w', structure: 'WOOD', areaM2: 100, amount: 5_000_000 })];
    expect(summarizePerSqm([...rc, ...wood])).toEqual([
      { structure: 'RC', count: 5, p25: 90_000, median: 100_000, p75: 110_000 },
    ]);
  });

  it('보정 계수: 민간/공공 비율의 중앙값, 표본 부족이면 없음', () => {
    expect(calibrationFactor([70_000, 75_000, 80_000, 85_000, 90_000], 100_000)).toBe(0.8);
    expect(calibrationFactor([70_000], 100_000)).toBeUndefined();
  });
});

describe('수집기', () => {
  it('월 단위 구간(연도 넘어감 포함)', () => {
    const w = monthWindows('2025-11', '2026-02');
    expect(w).toHaveLength(4);
    expect(w[3][1].getDate()).toBe(28);
  });

  it('페이지를 끝까지 넘기고, 키 미등록 오류를 그대로 알린다', async () => {
    const pages = [
      { response: { header: { resultCode: '00' }, body: { totalCount: 2, items: [{ a: 1 }] } } },
      { response: { header: { resultCode: '00' }, body: { totalCount: 2, items: [{ a: 2 }] } } },
    ];
    const fetchOk = vi.fn(async () => ({ json: async () => pages.shift() }) as Response);
    const client = new G2bContractClient('k', fetchOk as unknown as typeof fetch);
    expect(await client.search('철거', new Date(2025, 0, 1), new Date(2025, 0, 31))).toHaveLength(
      2,
    );
    expect(String(fetchOk.mock.calls[0][0])).toContain('inqryBgnDate=20250101');

    const fetchErr = vi.fn(
      async () =>
        ({
          json: async () => ({
            OpenAPI_ServiceResponse: {
              cmmMsgHeader: {
                errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
                returnAuthMsg: '등록되지 않은 서비스키',
              },
            },
          }),
        }) as Response,
    );
    await expect(
      new G2bContractClient('k', fetchErr as unknown as typeof fetch).search(
        '철거',
        new Date(),
        new Date(),
      ),
    ).rejects.toThrow('SERVICE_KEY_IS_NOT_REGISTERED_ERROR');
  });
});

describe('규모 구간 기준표', () => {
  const band = (structure: 'RC' | 'BRICK', minM2: number, count: number) => ({
    structure,
    minM2,
    maxM2: minM2 === 50 ? 100 : 200,
    count,
    p25: 200_000,
    median: 300_000,
    p75: 500_000,
  });

  it('구조·연면적 구간이 맞는 행으로 이 현장 금액 범위를 낸다(만 원 단위)', () => {
    const ref = publicPriceReference([band('BRICK', 50, 120)], 'BRICK', 66.6);
    expect(ref).toMatchObject({ count: 120, minAmount: 13_320_000, maxAmount: 33_300_000 });
  });

  it('구간·구조가 없거나 표본이 적으면 띄우지 않는다', () => {
    expect(publicPriceReference([band('BRICK', 50, 120)], 'RC', 66.6)).toBeNull();
    expect(publicPriceReference([band('BRICK', 50, 120)], 'BRICK', 150)).toBeNull();
    expect(publicPriceReference([band('BRICK', 50, 6)], 'BRICK', 66.6)).toBeNull();
    expect(publicPriceReference([band('BRICK', 50, 120)], undefined, 66.6)).toBeNull();
    expect(publicPriceReference([band('BRICK', 50, 120)], 'BRICK', 1500)).toBeNull();
  });

  it('구조×구간별로 묶고 구간 밖(1,000㎡ 이상)은 뺀다', () => {
    const rows = [60, 70, 80, 90, 95, 1500].map((areaM2, i) =>
      contract({ id: `b${i}`, structure: 'BRICK', areaM2, amount: areaM2 * 300_000 }),
    );
    expect(summarizePerSqmByBand(rows)).toEqual([
      {
        structure: 'BRICK',
        minM2: 50,
        maxM2: 100,
        count: 5,
        p25: 300_000,
        median: 300_000,
        p75: 300_000,
      },
    ]);
  });
});
