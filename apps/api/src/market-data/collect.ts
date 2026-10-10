/**
 * 나라장터 철거 계약 수집 → 구조별 ㎡당 철거비 요약.
 *
 *   npm run market:g2b -w @dimol/api -- --from 2024-01 --to 2026-09
 *   npm run market:g2b -w @dimol/api -- --from 2026-09 --to 2026-09 --dry-run
 *
 * 결과: apps/api/data/market/g2b-demolition.jsonl (계약별), summary.json (구조별 분포).
 * 서버 기동과 무관한 오프라인 작업이라 config/env.ts(서버 필수값 검사)를 거치지 않는다.
 * 키: G2B_API_KEY, 없으면 같은 data.go.kr 계정 키인 VISION_BLDG_LEDGER_KEY.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMOLITION_CONTRACT_KEYWORDS, contractPricePerSqm, summarizePerSqm } from '@dimol/shared';
import { G2bContractClient, dedupeContracts, normalizeContract } from './g2b-client.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 'YYYY-MM' 범위를 월 단위 구간으로 — 이 서비스는 긴 기간을 한 번에 조회하면 거절한다. */
export function monthWindows(from: string, to: string): Array<[Date, Date]> {
  const index = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) throw new Error(`날짜 형식은 YYYY-MM 입니다: ${ym}`);
    return y * 12 + (m - 1);
  };
  const out: Array<[Date, Date]> = [];
  for (let i = index(from); i <= index(to); i++) {
    const y = Math.floor(i / 12);
    const m = i % 12;
    out.push([new Date(y, m, 1), new Date(y, m + 1, 0)]);
  }
  return out;
}

async function main(): Promise<void> {
  const apiKey = process.env.G2B_API_KEY || process.env.VISION_BLDG_LEDGER_KEY;
  if (!apiKey) throw new Error('G2B_API_KEY(또는 VISION_BLDG_LEDGER_KEY)가 .env 에 없습니다.');
  const from = arg('from');
  const to = arg('to') ?? from;
  if (!from || !to) throw new Error('--from YYYY-MM [--to YYYY-MM] 를 지정하세요.');
  const dryRun = process.argv.includes('--dry-run');

  const client = new G2bContractClient(apiKey);
  const all = [];
  for (const [start, end] of monthWindows(from, to)) {
    for (const keyword of DEMOLITION_CONTRACT_KEYWORDS) {
      const raw = await client.search(keyword, start, end);
      if (dryRun) {
        // 필드명 확인용 — 값이 아니라 키만 찍는다(기관·업체명 등은 로그에 남기지 않는다).
        console.log(`[${keyword}] ${raw.length}건, 필드:`, Object.keys(raw[0] ?? {}).join(', '));
        continue;
      }
      for (const r of raw) {
        const c = normalizeContract(r);
        if (c) all.push(c);
      }
    }
    console.log(`${start.toISOString().slice(0, 7)} 완료 (누적 ${all.length}건)`);
  }
  if (dryRun) return;

  const contracts = dedupeContracts(all);
  const priced = contracts.filter((c) => contractPricePerSqm(c) !== undefined);
  const summary = {
    range: { from, to },
    collectedAt: new Date().toISOString(),
    contracts: contracts.length,
    withPerSqm: priced.length,
    withStructure: priced.filter((c) => c.structure).length,
    perSqmByStructure: summarizePerSqm(contracts),
  };

  const dir = join(process.cwd(), 'data', 'market');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'g2b-demolition.jsonl'),
    contracts.map((c) => JSON.stringify(c)).join('\n'),
  );
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(
    `계약 ${summary.contracts}건 · ㎡당 단가 계산 가능 ${summary.withPerSqm}건 · 구조 확인 ${summary.withStructure}건`,
  );
  console.table(summary.perSqmByStructure);
}

if (process.argv[1]?.endsWith('collect.ts') || process.argv[1]?.endsWith('collect.js')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
