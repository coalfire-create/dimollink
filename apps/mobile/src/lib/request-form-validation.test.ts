import { describe, expect, it } from 'vitest';
import {
  errorSummary,
  hasErrors,
  validateRequestForm,
  type RequestFormValues,
} from './request-form-validation';

/**
 * 접수 직전의 마지막 관문이라, "막아야 할 걸 통과시키는" 쪽과
 * "괜찮은 입력을 막는" 쪽을 둘 다 본다.
 */

const base: RequestFormValues = {
  kind: 'DEMOLITION',
  region: '양평',
  siteAddress: '경기 양평군 양평읍 1-1',
  spaceSize: '30',
  floorCount: '지상 3층',
  wasteItems: [],
  loadAddress: '',
  unloadAddress: '',
  visitAt: '',
};

describe('validateRequestForm — 철거 요청', () => {
  it('제대로 채운 폼은 통과한다', () => {
    expect(hasErrors(validateRequestForm(base))).toBe(false);
  });

  it('현장 주소가 없으면 그 칸을 짚어 준다', () => {
    const errors = validateRequestForm({ ...base, siteAddress: '  ' });
    expect(errors.siteAddress).toBeTruthy();
  });

  it('면적·층수는 선택 입력이라 비어 있어도 통과한다', () => {
    expect(hasErrors(validateRequestForm({ ...base, spaceSize: '', floorCount: '' }))).toBe(false);
  });

  it('적었다면 숫자로 읽혀야 한다 — 견적 계산에 쓰이는 값이다', () => {
    expect(validateRequestForm({ ...base, spaceSize: '삼십평' }).spaceSize).toBeTruthy();
    expect(validateRequestForm({ ...base, spaceSize: '-5' }).spaceSize).toBeTruthy();
    expect(validateRequestForm({ ...base, floorCount: '지상층' }).floorCount).toBeTruthy();
  });

  it('여러 칸이 틀리면 한 번에 모두 돌려준다 — 고치고 누르기를 반복하지 않게', () => {
    const errors = validateRequestForm({ ...base, region: '', siteAddress: '', spaceSize: 'abc' });
    expect(Object.keys(errors).sort()).toEqual(['region', 'siteAddress', 'spaceSize']);
    expect(errorSummary(errors)).toContain('3개');
  });
});

describe('validateRequestForm — 운반 / 처리장 예약', () => {
  const transport: RequestFormValues = {
    ...base,
    kind: 'TRANSPORT',
    siteAddress: '',
    wasteItems: [{ material: 'PLAIN_CONCRETE', kg: 500 }],
    loadAddress: '상차지',
    unloadAddress: '하차지',
  };

  it('소재가 하나도 없으면 막는다', () => {
    expect(validateRequestForm({ ...transport, wasteItems: [] }).wasteItems).toBeTruthy();
  });

  it('상·하차지 주소가 모두 필요하다', () => {
    const errors = validateRequestForm({ ...transport, unloadAddress: '' });
    expect(errors.unloadAddress).toBeTruthy();
    expect(errors.loadAddress).toBeUndefined();
  });

  it('처리장 예약은 방문 날짜 형식까지 본다', () => {
    const reservation: RequestFormValues = { ...transport, kind: 'DISPOSAL_RESERVATION' };
    expect(validateRequestForm({ ...reservation, visitAt: '' }).visitAt).toBeTruthy();
    expect(validateRequestForm({ ...reservation, visitAt: '2026/10/01' }).visitAt).toBeTruthy();
    expect(validateRequestForm({ ...reservation, visitAt: '2026-10-01' }).visitAt).toBeUndefined();
  });
});

describe('errorSummary', () => {
  it('오류가 없으면 null', () => {
    expect(errorSummary({})).toBeNull();
  });

  it('하나면 그 문구를 그대로 쓴다', () => {
    expect(errorSummary({ region: '지역을 입력해 주세요.' })).toBe('지역을 입력해 주세요.');
  });
});
