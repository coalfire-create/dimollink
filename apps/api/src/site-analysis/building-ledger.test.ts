import {
  asbestosRisk,
  buildingFactsForVision,
  buildingTypeOf,
  floorLabel,
  formatApprovalDay,
  hasLedgerData,
  ledgerDisplayRows,
  parseFloorCount,
  perFloorAreaM2,
  structureCodeOf,
  totalFloorAreaM2,
  totalFloorCount,
  type BuildingLedgerInfo,
} from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { buildUserInstruction } from './analyzer.js';

/**
 * 건축물대장(공공데이터) 해석 — 디몰비전이 "촬영 전에 이미 아는 사실"을 만드는 계층.
 * 여기서 나온 값이 비전 프롬프트와 폼 프리필의 근거가 되므로 판정 규칙을 고정한다.
 */

const RC_2015: BuildingLedgerInfo = {
  strctCdNm: '철근콘크리트구조',
  roofCdNm: '(철근)콘크리트',
  mainPurpsCdNm: '제2종근린생활시설',
  grndFlrCnt: 3,
  ugrndFlrCnt: 1,
  totArea: 480.55,
  useAprDay: '20150312',
};

describe('석면 위험 판정', () => {
  it('사용승인 2000년 이전은 HIGH', () => {
    expect(asbestosRisk({ useAprDay: '19880401' })).toBe('HIGH');
  });

  it('2000~2009년은 POSSIBLE(석면 자재 금지 이전)', () => {
    expect(asbestosRisk({ useAprDay: '20030915' })).toBe('POSSIBLE');
    expect(asbestosRisk({ useAprDay: '20091231' })).toBe('POSSIBLE');
  });

  it('2010년 이후는 LOW', () => {
    expect(asbestosRisk({ useAprDay: '20100101' })).toBe('LOW');
    expect(asbestosRisk(RC_2015)).toBe('LOW');
  });

  it('슬레이트 지붕은 연도와 무관하게 HIGH', () => {
    expect(asbestosRisk({ useAprDay: '20200101', roofCdNm: '슬레이트' })).toBe('HIGH');
  });

  it('사용승인일이 없으면 UNKNOWN', () => {
    expect(asbestosRisk({ strctCdNm: '벽돌구조' })).toBe('UNKNOWN');
    expect(asbestosRisk(null)).toBe('UNKNOWN');
  });
});

describe('주구조 → 물량 추정 구조 코드', () => {
  it('콘크리트·철골 계열은 RC', () => {
    expect(structureCodeOf({ strctCdNm: '철근콘크리트구조' })).toBe('RC');
    expect(structureCodeOf({ strctCdNm: '철골철근콘크리트구조' })).toBe('RC');
    expect(structureCodeOf({ strctCdNm: '철골구조' })).toBe('RC');
  });

  it('조적 계열은 BRICK, 목조는 WOOD', () => {
    expect(structureCodeOf({ strctCdNm: '벽돌구조' })).toBe('BRICK');
    expect(structureCodeOf({ strctCdNm: '시멘트블록구조' })).toBe('BRICK');
    expect(structureCodeOf({ strctCdNm: '목구조' })).toBe('WOOD');
  });

  it('판정 불가·빈 값은 undefined', () => {
    expect(structureCodeOf({ strctCdNm: '기타구조' })).toBeUndefined();
    expect(structureCodeOf(null)).toBeUndefined();
  });
});

describe('주용도 → 건물 종류', () => {
  it('대표 용도를 폼 선택지로 매핑한다', () => {
    expect(buildingTypeOf({ mainPurpsCdNm: '아파트' })).toBe('APARTMENT');
    expect(buildingTypeOf({ mainPurpsCdNm: '단독주택' })).toBe('HOUSING');
    expect(buildingTypeOf({ mainPurpsCdNm: '제1종근린생활시설' })).toBe('COMMERCIAL');
    expect(buildingTypeOf({ mainPurpsCdNm: '업무시설' })).toBe('OFFICE');
    expect(buildingTypeOf({ mainPurpsCdNm: '공장' })).toBe('FACTORY');
    expect(buildingTypeOf({ mainPurpsCdNm: '교육연구시설' })).toBe('OTHER');
  });

  it('용도가 없으면 undefined(폼 기본값을 덮어쓰지 않는다)', () => {
    expect(buildingTypeOf({})).toBeUndefined();
  });
});

describe('표시용 파생값', () => {
  it('연면적은 totArea 우선, 없으면 용적률산정연면적', () => {
    expect(totalFloorAreaM2({ totArea: 100.44, vlRatEstmTotArea: 90 })).toBe(100.4);
    expect(totalFloorAreaM2({ vlRatEstmTotArea: 90 })).toBe(90);
    expect(totalFloorAreaM2({ totArea: 0 })).toBeUndefined();
  });

  it('층수는 지상·지하를 함께 표기하고, 없으면 undefined', () => {
    expect(floorLabel(RC_2015)).toBe('지상 3층 / 지하 1층');
    expect(floorLabel({ grndFlrCnt: 2, ugrndFlrCnt: 0 })).toBe('지상 2층');
    expect(floorLabel({})).toBeUndefined();
  });

  it('총 층수는 지상+지하를 합산한다', () => {
    expect(totalFloorCount(RC_2015)).toBe(4);
    expect(totalFloorCount({ grndFlrCnt: 2 })).toBe(2);
    expect(totalFloorCount({})).toBeUndefined();
  });

  it('한 층 바닥면적은 연면적을 총 층수로 나눈 값', () => {
    // 연면적 480.6㎡(소수1자리 반올림) / (지상3+지하1) = 120.2㎡
    expect(perFloorAreaM2(RC_2015)).toBe(120.2);
    // 층수를 모르면 연면적을 그대로 한 층으로 본다.
    expect(perFloorAreaM2({ totArea: 90 })).toBe(90);
    expect(perFloorAreaM2({})).toBeUndefined();
  });

  it('자유 입력 층수 문자열에서 총 층수를 뽑는다', () => {
    expect(parseFloorCount('지상 2층 / 지하 1층')).toBe(3);
    expect(parseFloorCount('3층')).toBe(3);
    expect(parseFloorCount('2')).toBe(2);
    expect(parseFloorCount('단층')).toBeUndefined();
    expect(parseFloorCount('')).toBeUndefined();
  });

  it('사용승인일을 사람이 읽는 형태로 바꾼다', () => {
    expect(formatApprovalDay('20150312')).toBe('2015. 03. 12.');
    expect(formatApprovalDay('')).toBeUndefined();
  });

  it('표시 행은 값이 있는 항목만 만든다', () => {
    const rows = ledgerDisplayRows(RC_2015).map((r) => r.label);
    expect(rows).toEqual(['주용도', '주구조', '지붕', '층수', '연면적', '사용승인일']);
    expect(ledgerDisplayRows({})).toEqual([]);
  });

  it('쓸 값이 하나도 없으면 대장 정보 없음으로 본다', () => {
    expect(hasLedgerData(RC_2015)).toBe(true);
    expect(hasLedgerData({})).toBe(false);
    expect(hasLedgerData(null)).toBe(false);
  });
});

describe('비전 프롬프트용 사실 문장', () => {
  it('대장 값들을 확정 사실로 명시하고 대장 우선 규칙을 준다', () => {
    const facts = buildingFactsForVision(RC_2015) ?? '';
    expect(facts).toContain('제2종근린생활시설');
    expect(facts).toContain('철근콘크리트구조');
    expect(facts).toContain('지상 3층 / 지하 1층');
    expect(facts).toContain('480.6㎡');
    expect(facts).toContain('2015년');
    expect(facts).toContain('대장 정보를 우선');
  });

  it('지하층이 있으면 지하 해체 공정을 요구한다', () => {
    expect(buildingFactsForVision(RC_2015)).toContain('지하 1개 층');
    expect(buildingFactsForVision({ ...RC_2015, ugrndFlrCnt: 0 })).not.toContain('지하 1개 층');
  });

  it('석면 위험 시기에는 사전조사 지시를 넣는다', () => {
    const old = buildingFactsForVision({ ...RC_2015, useAprDay: '19910101' }) ?? '';
    expect(old).toContain('석면 주의');
    expect(old).toContain('석면 사전조사');
  });

  it('2009년 이후 건물은 석면 과대 추정을 억제한다', () => {
    expect(buildingFactsForVision(RC_2015)).toContain('과도하게 추정하지 마세요');
  });

  it('쓸 정보가 없으면 null(프롬프트를 오염시키지 않는다)', () => {
    expect(buildingFactsForVision({})).toBeNull();
    expect(buildingFactsForVision(null)).toBeNull();
  });
});

describe('buildUserInstruction — 대장 정보 주입', () => {
  it('대장 정보가 있으면 단일 주구조 힌트 대신 전체 사실을 넣는다', () => {
    const text = buildUserInstruction(undefined, '벽돌구조', 3, RC_2015);
    expect(text).toContain('건축물대장 확인 사실');
    expect(text).toContain('제2종근린생활시설');
    expect(text).not.toContain('[핵심 힌트]');
    expect(text).toContain('3장의 사진');
  });

  it('대장 정보가 없으면 기존 주구조 힌트로 폴백한다(하위호환)', () => {
    const text = buildUserInstruction(undefined, '철근콘크리트구조', 1);
    expect(text).toContain('[핵심 힌트]');
    expect(text).toContain('철근콘크리트구조');
  });

  it('현장 메모는 그대로 덧붙인다', () => {
    expect(buildUserInstruction('지하 물차 있음', undefined, 1)).toContain('[현장 메모] 지하 물차 있음');
  });
});
