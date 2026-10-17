/**
 * 현장 실사 희망 일시 고르기 — 날짜·시간 칩.
 *
 * 예전에는 "2026-09-20 14:00" 형식을 직접 타이핑해야 했다. 고령 사용자에게 날짜 형식
 * 입력은 거의 불가능에 가깝고, 형식이 하나만 틀려도 예약이 막혔다. 내일부터 일주일을
 * 칩으로 보여 주고, 시간은 업체가 실제로 가는 네 구간만 고르게 한다.
 */
export const VISIT_HOURS = [9, 11, 14, 16] as const;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface VisitDay {
  /** 기기 시간대 기준 'YYYY-MM-DD'. */
  key: string;
  /** 칩에 쓰는 말 — "내일", "모레", "10/20(월)". */
  label: string;
}

function dayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 내일부터 count 일. 오늘은 넣지 않는다 — 당일 실사는 업체가 맞추기 어렵다. */
export function visitDays(now: Date, count = 7): VisitDay[] {
  const days: VisitDay[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label =
      i === 1
        ? '내일'
        : i === 2
          ? '모레'
          : `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
    days.push({ key: dayKey(d), label });
  }
  return days;
}

/** "오전 9시", "오후 2시". */
export function hourLabel(hour: number): string {
  if (hour < 12) return `오전 ${hour}시`;
  return `오후 ${hour === 12 ? 12 : hour - 12}시`;
}

/** 고른 날짜·시간 → 서버로 보낼 ISO(기기 시간대 기준 그 시각). */
export function visitIso(day: string, hour: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour).toISOString();
}
