import type { MatchStatus, ServiceRequest } from '@dimol/shared';

/**
 * 대시보드 필터·정렬·페이지네이션 — 화면에서 떼어낸 순수 함수.
 *
 * 요청이 열 건만 넘어가도 "지금 뭐가 진행 중이지?"를 스크롤로 찾게 된다.
 * 상태 탭 · 기간 · 정렬 · 페이지를 조합해 목록을 좁히는 규칙을 여기 모아 두면
 * 화면은 "무엇을 고르게 할지"만 신경 쓰면 된다.
 */

/** 상태 탭 — 서버 상태 7개를 사용자가 실제로 구분하는 4묶음으로 줄인다. */
export type StatusFilter = 'ALL' | 'ACTIVE' | 'DONE' | 'CANCELLED';

export const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: '전체' },
  { value: 'ACTIVE', label: '진행중' },
  { value: 'DONE', label: '완료' },
  { value: 'CANCELLED', label: '취소' },
];

const ACTIVE_STATUSES: MatchStatus[] = ['REQUESTED', 'MATCHED', 'PAID', 'IN_PROGRESS'];
const DONE_STATUSES: MatchStatus[] = ['COMPLETED', 'SETTLED'];

export function matchesStatusFilter(status: MatchStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'ACTIVE':
      return ACTIVE_STATUSES.includes(status);
    case 'DONE':
      return DONE_STATUSES.includes(status);
    case 'CANCELLED':
      return status === 'CANCELLED';
  }
}

/** 기간 필터 — 접수일 기준. */
export type PeriodFilter = 'ALL' | 'DAYS_7' | 'DAYS_30' | 'DAYS_90';

export const PERIOD_FILTERS: Array<{ value: PeriodFilter; label: string }> = [
  { value: 'ALL', label: '전체 기간' },
  { value: 'DAYS_7', label: '최근 7일' },
  { value: 'DAYS_30', label: '최근 30일' },
  { value: 'DAYS_90', label: '최근 90일' },
];

const PERIOD_DAYS: Record<Exclude<PeriodFilter, 'ALL'>, number> = {
  DAYS_7: 7,
  DAYS_30: 30,
  DAYS_90: 90,
};

export function matchesPeriod(createdAt: string, filter: PeriodFilter, now = Date.now()): boolean {
  if (filter === 'ALL') return true;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return true; // 날짜가 깨진 건은 숨기지 않는다 — 숨기면 영영 못 찾는다.
  return now - created <= PERIOD_DAYS[filter] * 24 * 60 * 60 * 1000;
}

/** 정렬 기준 — 컬럼 정렬(접수일·중량·상태)의 모바일 대응. */
export type SortKey = 'NEWEST' | 'OLDEST' | 'TONS_DESC' | 'STATUS';

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'NEWEST', label: '최신순' },
  { value: 'OLDEST', label: '오래된순' },
  { value: 'TONS_DESC', label: '중량 많은순' },
  { value: 'STATUS', label: '진행 단계순' },
];

/** 진행 단계 정렬용 순서 — 화면 타임라인과 같은 순서. 취소는 맨 뒤. */
const STATUS_ORDER: Record<MatchStatus, number> = {
  REQUESTED: 0,
  MATCHED: 1,
  PAID: 2,
  IN_PROGRESS: 3,
  COMPLETED: 4,
  SETTLED: 5,
  CANCELLED: 6,
};

export function sortRequests(items: ServiceRequest[], key: SortKey): ServiceRequest[] {
  const sorted = [...items];
  switch (key) {
    case 'NEWEST':
      return sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    case 'OLDEST':
      return sorted.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    case 'TONS_DESC':
      return sorted.sort((a, b) => (b.wasteTons ?? 0) - (a.wasteTons ?? 0));
    case 'STATUS':
      return sorted.sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
  }
}

export interface DashboardFilters {
  status: StatusFilter;
  period: PeriodFilter;
  sort: SortKey;
  /** 0-based. */
  page: number;
  pageSize: number;
}

export interface DashboardPage {
  /** 현재 페이지에 보일 항목. */
  items: ServiceRequest[];
  /** 필터까지 적용한 전체 건수(페이지네이션 표시용). */
  total: number;
  totalPages: number;
  /** 요청한 page 가 범위를 벗어나면 보정된 값. */
  page: number;
  /** 상태 탭 배지에 쓸 묶음별 건수(기간 필터까지만 반영). */
  counts: Record<StatusFilter, number>;
}

export function buildDashboardPage(
  all: ServiceRequest[],
  filters: DashboardFilters,
  now = Date.now(),
): DashboardPage {
  const inPeriod = all.filter((r) => matchesPeriod(r.createdAt, filters.period, now));

  const counts: Record<StatusFilter, number> = {
    ALL: inPeriod.length,
    ACTIVE: inPeriod.filter((r) => matchesStatusFilter(r.status, 'ACTIVE')).length,
    DONE: inPeriod.filter((r) => matchesStatusFilter(r.status, 'DONE')).length,
    CANCELLED: inPeriod.filter((r) => matchesStatusFilter(r.status, 'CANCELLED')).length,
  };

  const filtered = sortRequests(
    inPeriod.filter((r) => matchesStatusFilter(r.status, filters.status)),
    filters.sort,
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
  // 필터를 좁혀 페이지 수가 줄면 빈 페이지에 남는다 — 마지막 페이지로 당긴다.
  const page = Math.min(Math.max(0, filters.page), totalPages - 1);
  const start = page * filters.pageSize;

  return {
    items: filtered.slice(start, start + filters.pageSize),
    total: filtered.length,
    totalPages,
    page,
    counts,
  };
}
