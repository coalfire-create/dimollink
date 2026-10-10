import { describe, expect, it } from 'vitest';
import { buildLegalDongIndex, parseJibun, resolveLegalDong } from './jibun.js';
import { ledgerFacts } from './link-ledger.js';

const CSV = [
  '법정동코드,법정동명,폐지여부',
  '4817000000,경상남도 진주시,존재',
  '4817010100,경상남도 진주시 인사동,존재',
  '1117012900,서울특별시 용산구 용산동2가,존재',
  '2720010100,대구광역시 중구 대봉동,존재',
  '2614010100,부산광역시 중구 대봉동,존재',
  '4476025000,충청남도 부여군 부여읍,존재',
  '4476025029,충청남도 부여군 부여읍 능산리,존재',
  '4817010999,경상남도 진주시 옛동,폐지',
].join('\n');
const index = buildLegalDongIndex(CSV);

describe('공사명 지번 파싱', () => {
  it('번지·부번·여러 동 표시를 읽는다', () => {
    expect(parseJibun('인사동 9-2번지 외 2동 철거공사')).toEqual({
      word: '인사동',
      san: false,
      bun: 9,
      ji: 2,
      multiBuilding: true,
    });
    expect(parseJibun('용산동2가 1-357 빈집 철거공사')?.word).toBe('용산동2가');
    expect(parseJibun('철거공사(능산리 산 377번지)')).toMatchObject({ san: true, bun: 377, ji: 0 });
  });

  it('통·반·길 번호는 지번이 아니다', () => {
    expect(parseJibun('하망동 8통 도로개설 건축물 철거공사')).toBeUndefined();
    expect(parseJibun('노후 관사 철거공사')).toBeUndefined();
  });
});

describe('법정동 결정', () => {
  it('폐지·시군구 행은 색인하지 않는다', () => {
    expect(index.has('옛동')).toBe(false);
    expect(index.has('진주시')).toBe(false);
  });

  it('앞 글자가 붙어 있어도 뒤에서부터 맞춘다', () => {
    expect(resolveLegalDong('사업인사동', undefined, index)?.code).toBe('4817010100');
  });

  it('같은 이름이 여러 곳이면 기관명의 시군구로 고르고, 모르면 버린다', () => {
    expect(resolveLegalDong('대봉동', '대구광역시 중구', index)?.code).toBe('2720010100');
    expect(resolveLegalDong('대봉동', '한국토지주택공사', index)).toBeUndefined();
  });
});

describe('표제부 → 연면적', () => {
  const items = [
    { totArea: '120.5', strctCdNm: '조적구조' },
    { totArea: '30', strctCdNm: '경량철골구조' },
  ];
  it('단일 동 철거는 본관만, 여러 동 철거는 합계', () => {
    expect(ledgerFacts(items, false)).toEqual({ areaM2: 120.5, structure: 'BRICK' });
    expect(ledgerFacts(items, true)?.areaM2).toBe(150.5);
    expect(ledgerFacts([], false)).toBeUndefined();
  });
});
