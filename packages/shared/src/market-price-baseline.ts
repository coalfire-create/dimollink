/**
 * 공공 철거 계약 ㎡당 시세 기준표 — 자동 생성 파일, 직접 고치지 말 것.
 * 다시 만들기: npm run market:g2b → market:link → market:baseline (apps/api)
 *
 * 출처: 조달청 나라장터 공사 계약(2023-01 ~ 2026-09) 중 공사명에 지번이 있는 건물 철거
 * 634건을 국토교통부 건축물대장(연면적·구조)과 연결.
 * 공공 공사는 설계·안전관리 비용과 부지 정리가 섞여 민간보다 높고 편차가 크다 — "참고"로만 쓴다.
 */
import type { PerSqmBandStats } from './market-price.js';

export const PUBLIC_DEMOLITION_BASELINE_PERIOD = { from: '2023-01', to: '2026-09' } as const;

export const PUBLIC_DEMOLITION_BASELINE: readonly PerSqmBandStats[] = [
  {
    structure: 'RC',
    count: 5,
    p25: 392458,
    median: 447708,
    p75: 1547368,
    minM2: 0,
    maxM2: 50,
  },
  {
    structure: 'RC',
    count: 18,
    p25: 139460,
    median: 187370,
    p75: 497994,
    minM2: 50,
    maxM2: 100,
  },
  {
    structure: 'RC',
    count: 34,
    p25: 81867,
    median: 134821,
    p75: 298981,
    minM2: 100,
    maxM2: 200,
  },
  {
    structure: 'RC',
    count: 65,
    p25: 57646,
    median: 128718,
    p75: 343753,
    minM2: 200,
    maxM2: 500,
  },
  {
    structure: 'RC',
    count: 46,
    p25: 87674,
    median: 214124,
    p75: 234808,
    minM2: 500,
    maxM2: 1000,
  },
  {
    structure: 'BRICK',
    count: 62,
    p25: 389843,
    median: 657585,
    p75: 981227,
    minM2: 0,
    maxM2: 50,
  },
  {
    structure: 'BRICK',
    count: 126,
    p25: 221267,
    median: 304356,
    p75: 593282,
    minM2: 50,
    maxM2: 100,
  },
  {
    structure: 'BRICK',
    count: 76,
    p25: 121897,
    median: 192633,
    p75: 298270,
    minM2: 100,
    maxM2: 200,
  },
  {
    structure: 'BRICK',
    count: 41,
    p25: 67213,
    median: 183722,
    p75: 254641,
    minM2: 200,
    maxM2: 500,
  },
  {
    structure: 'WOOD',
    count: 67,
    p25: 358054,
    median: 498102,
    p75: 725067,
    minM2: 0,
    maxM2: 50,
  },
  {
    structure: 'WOOD',
    count: 71,
    p25: 228465,
    median: 345989,
    p75: 749017,
    minM2: 50,
    maxM2: 100,
  },
  {
    structure: 'WOOD',
    count: 17,
    p25: 103742,
    median: 139075,
    p75: 184029,
    minM2: 100,
    maxM2: 200,
  },
  {
    structure: 'WOOD',
    count: 6,
    p25: 63041,
    median: 81404,
    p75: 282504,
    minM2: 200,
    maxM2: 500,
  },
];
