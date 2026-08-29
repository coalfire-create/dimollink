import { isNationwideRegion, normalizeRegionTokens, regionMatches } from '@dimol/shared';
import { describe, expect, it } from 'vitest';

/**
 * 지역 매칭 — 요청이 업체 일감 피드에 실제로 도달하는지를 좌우한다.
 * 지역은 자유 입력이라 표기 편차를 흡수하되, 서로 다른 시·군까지 열어주지는 않는다.
 */

describe('normalizeRegionTokens', () => {
  it('행정구역 접미사를 떼고 토큰으로 만든다', () => {
    expect(normalizeRegionTokens('경기도 양평군')).toEqual(['경기', '양평']);
    expect(normalizeRegionTokens('서울특별시 강남구')).toEqual(['서울', '강남']);
    expect(normalizeRegionTokens('  경기 양평  ')).toEqual(['경기', '양평']);
  });

  it('구분자(쉼표·가운뎃점·슬래시)도 나눈다', () => {
    expect(normalizeRegionTokens('경기,양평')).toEqual(['경기', '양평']);
    expect(normalizeRegionTokens('경기·양평')).toEqual(['경기', '양평']);
  });

  it('접미사만 남는 짧은 입력은 원본을 유지한다', () => {
    expect(normalizeRegionTokens('시')).toEqual(['시']);
    expect(normalizeRegionTokens('')).toEqual([]);
  });
});

describe('regionMatches — 같은 곳으로 봐야 하는 표기', () => {
  it('완전히 같은 표기', () => {
    expect(regionMatches('경기 양평', '경기 양평')).toBe(true);
  });

  it('접미사 차이를 흡수한다', () => {
    expect(regionMatches('경기도 양평군', '경기 양평')).toBe(true);
    expect(regionMatches('서울특별시 강남구', '서울 강남')).toBe(true);
  });

  it('앞뒤 공백·구분자 차이를 흡수한다', () => {
    expect(regionMatches('경기 양평 ', '경기  양평')).toBe(true);
  });

  it('광역만 적은 요청은 그 안의 업체에 도달한다', () => {
    expect(regionMatches('경기', '경기 양평')).toBe(true);
  });

  it('시·군만 적은 요청도 도달한다', () => {
    expect(regionMatches('양평', '경기 양평')).toBe(true);
  });

  it('전국 표기는 어디와도 매칭된다', () => {
    expect(regionMatches('전국', '경기 양평')).toBe(true);
    expect(regionMatches('경기 양평', '전국구')).toBe(true);
    expect(isNationwideRegion('전국')).toBe(true);
    expect(isNationwideRegion('경기')).toBe(false);
  });
});

describe('regionMatches — 열어주면 안 되는 조합', () => {
  it('같은 도 안의 다른 시·군은 매칭하지 않는다', () => {
    expect(regionMatches('경기 양평', '경기 성남')).toBe(false);
  });

  it('다른 광역은 매칭하지 않는다', () => {
    expect(regionMatches('서울 강남', '경기 양평')).toBe(false);
    expect(regionMatches('부산', '서울')).toBe(false);
  });

  it('빈 값은 판정 불가로 본다', () => {
    expect(regionMatches('', '경기 양평')).toBe(false);
    expect(regionMatches('경기 양평', undefined)).toBe(false);
    expect(regionMatches(null, null)).toBe(false);
  });
});
