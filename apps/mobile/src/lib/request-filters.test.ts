import { describe, expect, it } from 'vitest';
import type { MatchStatus, ServiceRequest } from '@dimol/shared';
import {
  buildDashboardPage,
  matchesPeriod,
  matchesStatusFilter,
  sortRequests,
} from './request-filters';

/**
 * 대시보드가 실제로 의존하는 규칙만 검증한다 — 화면은 이 결과를 그리기만 한다.
 * (탭 건수·페이지 보정·정렬이 틀리면 사용자는 "내 요청이 사라졌다"고 느낀다.)
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-15T00:00:00Z');

function req(id: string, status: MatchStatus, daysAgo: number, tons = 1): ServiceRequest {
  return {
    id,
    kind: 'DEMOLITION',
    requesterId: 'u1',
    region: '양평',
    wasteCategory: 'CONSTRUCTION',
    wasteItems: [],
    wasteTons: tons,
    allbaroRequested: false,
    sitePhotoKeys: [],
    siteAddress: '경기 양평군 양평읍 1-1',
    status,
    createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
    updatedAt: new Date(NOW - daysAgo * DAY).toISOString(),
  };
}

describe('matchesStatusFilter', () => {
  it('진행중 묶음은 접수~작업중까지만 포함한다', () => {
    expect(matchesStatusFilter('REQUESTED', 'ACTIVE')).toBe(true);
    expect(matchesStatusFilter('IN_PROGRESS', 'ACTIVE')).toBe(true);
    expect(matchesStatusFilter('COMPLETED', 'ACTIVE')).toBe(false);
    expect(matchesStatusFilter('CANCELLED', 'ACTIVE')).toBe(false);
  });

  it('완료 묶음은 처리완료와 정산완료를 함께 본다', () => {
    expect(matchesStatusFilter('COMPLETED', 'DONE')).toBe(true);
    expect(matchesStatusFilter('SETTLED', 'DONE')).toBe(true);
  });
});

describe('matchesPeriod', () => {
  it('기간 안쪽만 통과시킨다', () => {
    expect(matchesPeriod(new Date(NOW - 3 * DAY).toISOString(), 'DAYS_7', NOW)).toBe(true);
    expect(matchesPeriod(new Date(NOW - 10 * DAY).toISOString(), 'DAYS_7', NOW)).toBe(false);
  });

  it('날짜가 깨진 건은 숨기지 않는다 — 숨기면 영영 못 찾는다', () => {
    expect(matchesPeriod('not-a-date', 'DAYS_7', NOW)).toBe(true);
  });
});

describe('sortRequests', () => {
  const items = [req('a', 'REQUESTED', 1, 2), req('b', 'SETTLED', 5, 9), req('c', 'PAID', 3, 5)];

  it('최신순/오래된순', () => {
    expect(sortRequests(items, 'NEWEST').map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(sortRequests(items, 'OLDEST').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('중량 많은순', () => {
    expect(sortRequests(items, 'TONS_DESC').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('진행 단계순 — 타임라인 순서를 따른다', () => {
    expect(sortRequests(items, 'STATUS').map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const before = items.map((r) => r.id);
    sortRequests(items, 'OLDEST');
    expect(items.map((r) => r.id)).toEqual(before);
  });
});

describe('buildDashboardPage', () => {
  const all = [
    req('a', 'REQUESTED', 1),
    req('b', 'IN_PROGRESS', 2),
    req('c', 'COMPLETED', 40),
    req('d', 'CANCELLED', 3),
  ];

  it('탭 건수는 기간 필터까지만 반영한다', () => {
    const page = buildDashboardPage(
      all,
      { status: 'ACTIVE', period: 'DAYS_30', sort: 'NEWEST', page: 0, pageSize: 10 },
      NOW,
    );
    // 40일 전 완료 건은 기간 밖 → 어느 탭 건수에도 안 들어간다.
    expect(page.counts).toEqual({ ALL: 3, ACTIVE: 2, DONE: 0, CANCELLED: 1 });
    expect(page.items.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('페이지를 나눈다', () => {
    const page = buildDashboardPage(
      all,
      { status: 'ALL', period: 'ALL', sort: 'NEWEST', page: 1, pageSize: 2 },
      NOW,
    );
    expect(page.totalPages).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(4);
  });

  it('필터가 좁아져 페이지가 사라지면 마지막 페이지로 당긴다 — 빈 화면을 보여주지 않는다', () => {
    const page = buildDashboardPage(
      all,
      { status: 'CANCELLED', period: 'ALL', sort: 'NEWEST', page: 3, pageSize: 10 },
      NOW,
    );
    expect(page.page).toBe(0);
    expect(page.items.map((r) => r.id)).toEqual(['d']);
  });
});
