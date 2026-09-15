import { describe, expect, it } from 'vitest';
import type { ServiceRequest } from '@dimol/shared';
import { requestSubtitle, requestTons } from './request-summary';

const base = {
  id: 'r1',
  requesterId: 'u1',
  status: 'PENDING',
  region: '서울 강남구',
  wasteCategory: 'CONSTRUCTION',
  wasteItems: [],
  sitePhotoKeys: [],
  allbaroRequested: false,
  createdAt: new Date().toISOString(),
} as unknown as ServiceRequest;

const demolition = (tons: number) =>
  ({ ...base, kind: 'DEMOLITION', siteAddress: '서울 강남구 테헤란로 123', wasteTons: tons }) as ServiceRequest;

describe('requestTons', () => {
  it('실사 전 철거(0톤)는 표기하지 않는다 — 모든 건이 "0톤"으로 같아 보인다', () => {
    expect(requestTons(demolition(0))).toBeNull();
  });

  it('물량이 잡히면 톤으로 보여준다', () => {
    expect(requestTons(demolition(12))).toBe('12톤');
  });
});

describe('requestSubtitle', () => {
  it('철거는 현장 주소로 구분한다', () => {
    expect(requestSubtitle(demolition(0))).toBe('서울 강남구 테헤란로 123');
  });

  it('운반은 상차 → 하차 구간으로 구분한다', () => {
    const transport = {
      ...base,
      kind: 'TRANSPORT',
      wasteTons: 3,
      loadAddress: '성남시 분당구',
      unloadAddress: '용인시 처인구',
    } as ServiceRequest;
    expect(requestSubtitle(transport)).toBe('성남시 분당구 → 용인시 처인구');
  });
});
