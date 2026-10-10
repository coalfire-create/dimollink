/**
 * 3단계: 대장과 연결된 공공 철거 계약 → 앱에 싣는 기준표(packages/shared/src/market-price-baseline.ts).
 *
 *   npm run market:baseline -w @dimol/api        (market:g2b → market:link 다음에)
 *
 * 기준표에는 구조·규모 구간별 통계만 들어간다(개별 계약·기관명은 싣지 않는다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarizePerSqmByBand, type PublicDemolitionContract } from '@dimol/shared';

export function renderBaselineSource(
  rows: ReturnType<typeof summarizePerSqmByBand>,
  meta: { from: string; to: string; contracts: number },
): string {
  return `/**
 * 공공 철거 계약 ㎡당 시세 기준표 — 자동 생성 파일, 직접 고치지 말 것.
 * 다시 만들기: npm run market:g2b → market:link → market:baseline (apps/api)
 *
 * 출처: 조달청 나라장터 공사 계약(${meta.from} ~ ${meta.to}) 중 공사명에 지번이 있는 건물 철거
 * ${meta.contracts}건을 국토교통부 건축물대장(연면적·구조)과 연결.
 * 공공 공사는 설계·안전관리 비용과 부지 정리가 섞여 민간보다 높고 편차가 크다 — "참고"로만 쓴다.
 */
import type { PerSqmBandStats } from './market-price.js';

export const PUBLIC_DEMOLITION_BASELINE_PERIOD = { from: '${meta.from}', to: '${meta.to}' } as const;

export const PUBLIC_DEMOLITION_BASELINE: readonly PerSqmBandStats[] = ${JSON.stringify(rows, null, 2)};
`;
}

function main(): void {
  const dir = join(process.cwd(), 'data', 'market');
  const linked = readFileSync(join(dir, 'g2b-demolition-linked.jsonl'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PublicDemolitionContract);
  const dates = linked
    .map((c) => c.contractDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  const rows = summarizePerSqmByBand(linked);
  const out = join(
    process.cwd(),
    '..',
    '..',
    'packages',
    'shared',
    'src',
    'market-price-baseline.ts',
  );
  writeFileSync(
    out,
    renderBaselineSource(rows, {
      from: (dates[0] ?? '').slice(0, 7),
      to: (dates[dates.length - 1] ?? '').slice(0, 7),
      contracts: rows.reduce((s, r) => s + r.count, 0),
    }),
  );
  console.table(rows);
  console.log(`기준표 작성: ${out}`);
}

if (process.argv[1]?.endsWith('baseline.ts') || process.argv[1]?.endsWith('baseline.js')) main();
