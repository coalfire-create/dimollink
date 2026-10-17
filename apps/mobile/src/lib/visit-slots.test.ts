import { describe, expect, it } from 'vitest';
import { hourLabel, visitDays, visitIso } from './visit-slots';

describe('visit slots', () => {
  it('내일부터 일주일, 앞 두 날은 "내일·모레"로', () => {
    const days = visitDays(new Date(2026, 9, 17, 22, 0)); // 2026-10-17(토) 밤
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ key: '2026-10-18', label: '내일' });
    expect(days[1]).toEqual({ key: '2026-10-19', label: '모레' });
    expect(days[2]).toEqual({ key: '2026-10-20', label: '10/20(화)' });
  });

  it('달이 바뀌어도 날짜가 맞다', () => {
    const days = visitDays(new Date(2026, 9, 30));
    expect(days[1]!.key).toBe('2026-11-01');
  });

  it('시간 칩은 오전/오후로 읽힌다', () => {
    expect(hourLabel(9)).toBe('오전 9시');
    expect(hourLabel(14)).toBe('오후 2시');
  });

  it('고른 날짜·시간은 그 시각의 ISO 로 바뀐다', () => {
    const iso = visitIso('2026-10-20', 14);
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([
      2026, 10, 20, 14,
    ]);
  });
});
