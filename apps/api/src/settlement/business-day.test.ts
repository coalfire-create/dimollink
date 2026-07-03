import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  buildKoreanHolidaySet,
  isBusinessDay,
  isWeekend,
  nextBusinessDay,
  solarHolidaysForYear,
} from '@dimol/shared';

// 2026-01 요일 기준: 01-01 목, 02 금, 03 토, 04 일, 05 월, 06 화, 07 수, 08 목, 09 금, 10 토.

describe('isWeekend', () => {
  it('토/일이면 true, 평일이면 false', () => {
    expect(isWeekend('2026-01-03')).toBe(true); // 토
    expect(isWeekend('2026-01-04')).toBe(true); // 일
    expect(isWeekend('2026-01-05')).toBe(false); // 월
  });

  it('잘못된 날짜는 예외', () => {
    expect(() => isWeekend('2026-13-01')).toThrow();
    expect(() => isWeekend('2026-02-30')).toThrow();
    expect(() => isWeekend('20260101')).toThrow();
  });
});

describe('isBusinessDay', () => {
  it('주말/공휴일이 아니면 영업일', () => {
    expect(isBusinessDay('2026-01-05')).toBe(true);
    expect(isBusinessDay('2026-01-03')).toBe(false); // 토
    expect(isBusinessDay('2026-01-05', new Set(['2026-01-05']))).toBe(false); // 공휴일
  });
});

describe('nextBusinessDay', () => {
  it('금요일 다음 영업일은 월요일(주말 건너뜀)', () => {
    expect(nextBusinessDay('2026-01-02')).toBe('2026-01-05');
  });

  it('평일 다음날이 평일이면 그대로', () => {
    expect(nextBusinessDay('2026-01-05')).toBe('2026-01-06');
  });

  it('다음날이 공휴일이면 그 다음 영업일로 순연', () => {
    expect(nextBusinessDay('2026-01-05', new Set(['2026-01-06']))).toBe('2026-01-07');
  });

  it('주말+연속 공휴일도 모두 건너뛴다', () => {
    const holidays = new Set(['2026-01-05', '2026-01-06']);
    expect(nextBusinessDay('2026-01-02', holidays)).toBe('2026-01-07');
  });
});

describe('addBusinessDays', () => {
  it('n=0이면 입력일 그대로', () => {
    expect(addBusinessDays('2026-01-03', 0)).toBe('2026-01-03');
  });

  it('영업일 기준 누적(주말 건너뜀)', () => {
    // 목(01-01) +3영업일 → 금(02) → 월(05) → 화(06)
    expect(addBusinessDays('2026-01-01', 3)).toBe('2026-01-06');
  });

  it('음수/비정수는 예외', () => {
    expect(() => addBusinessDays('2026-01-01', -1)).toThrow();
    expect(() => addBusinessDays('2026-01-01', 1.5)).toThrow();
  });
});

describe('buildKoreanHolidaySet / solarHolidaysForYear', () => {
  it('고정 공휴일을 연도별로 포함', () => {
    expect(solarHolidaysForYear(2026)).toContain('2026-03-01');
    const set = buildKoreanHolidaySet([2026]);
    expect(set.has('2026-01-01')).toBe(true); // 신정
    expect(set.has('2026-12-25')).toBe(true); // 성탄절
  });

  it('음력·대체공휴일은 extraHolidays로 주입', () => {
    const set = buildKoreanHolidaySet([2026], ['2026-02-17']); // 설날(예시)
    expect(set.has('2026-02-17')).toBe(true);
  });
});
