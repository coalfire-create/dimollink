/**
 * 2단계: 수집한 나라장터 철거 계약 중 공사명에 지번이 있는 건을 건축물대장과 이어
 * 연면적·구조를 붙이고, 구조별 ㎡당 철거비를 다시 요약한다.
 *
 *   npm run market:link -w @dimol/api            (먼저 market:g2b 로 수집해 둘 것)
 *
 * 입력: data/market/g2b-demolition.jsonl
 * 출력: data/market/g2b-demolition-linked.jsonl, summary-linked.json
 * 법정동코드 CSV(국토교통부, data.go.kr 파일데이터)는 없으면 내려받아 data/market/ 에 둔다.
 *
 * 한계: 이미 철거돼 대장이 말소된 건물은 조회되지 않는다(최근 계약일수록 잘 붙는다).
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contractPricePerSqm,
  structureCodeOf,
  summarizePerSqm,
  type PublicDemolitionContract,
} from '@dimol/shared';
import { encodeServiceKey } from '../geo/building-registry.js';
import { buildLegalDongIndex, parseJibun, resolveLegalDong, type Jibun } from './jibun.js';

const LEGAL_DONG_CSV_URL =
  'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000007699870&fileDetailSn=1';
const TITLE_ENDPOINT = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo';
/**
 * 동시 호출 수와 호출 간격. data.go.kr 은 초당 요청 제한을 넘기면 한동안 키를 막아
 * (LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR) 그 사이 결과가 전부 비게 된다.
 */
const CONCURRENCY = 1;
const CALL_GAP_MS = 300;
/** 오류 시 재시도 횟수와 대기(ms, 시도마다 배로). */
const RETRIES = 3;
const RETRY_BASE_MS = 3_000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= RETRIES) throw e;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt));
    }
  }
}

async function loadLegalDongCsv(dir: string): Promise<string> {
  const path = join(dir, 'legal-dong.csv');
  if (!existsSync(path)) {
    const res = await fetch(LEGAL_DONG_CSV_URL);
    if (!res.ok) throw new Error(`법정동코드 파일 다운로드 실패: ${res.status}`);
    // 원본은 CP949 — UTF-8 로 바꿔 저장한다.
    writeFileSync(path, new TextDecoder('euc-kr').decode(await res.arrayBuffer()));
  }
  return readFileSync(path, 'utf-8');
}

interface LedgerFacts {
  areaM2: number;
  structure: PublicDemolitionContract['structure'];
}

/** 필지의 표제부들 → 연면적. 여러 동 철거면 합계, 아니면 가장 큰 동(본관)만. */
export function ledgerFacts(
  items: Array<Record<string, unknown>>,
  multi: boolean,
): LedgerFacts | undefined {
  const withArea = items
    .map((it) => ({ it, area: Number(it.totArea) || 0 }))
    .filter((x) => x.area > 0)
    .sort((a, b) => b.area - a.area);
  const main = withArea[0];
  if (!main) return undefined;
  const areaM2 = multi ? withArea.reduce((s, x) => s + x.area, 0) : main.area;
  const structure = structureCodeOf({
    strctCdNm: typeof main.it.strctCdNm === 'string' ? main.it.strctCdNm : undefined,
    etcStrct: typeof main.it.etcStrct === 'string' ? main.it.etcStrct : undefined,
  });
  return { areaM2: Math.round(areaM2 * 10) / 10, structure };
}

export async function fetchTitle(
  apiKey: string,
  code: string,
  j: Jibun,
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    sigunguCd: code.slice(0, 5),
    bjdongCd: code.slice(5, 10),
    platGbCd: j.san ? '1' : '0',
    bun: String(j.bun).padStart(4, '0'),
    ji: String(j.ji).padStart(4, '0'),
    numOfRows: '100',
    pageNo: '1',
    _type: 'json',
  });
  const res = await fetch(`${TITLE_ENDPOINT}?serviceKey=${encodeServiceKey(apiKey)}&${params}`, {
    signal: AbortSignal.timeout(20_000),
  });
  // 트래픽 초과 등은 JSON 이 아닌 XML 이나 resultCode≠00 으로 온다 — 빈 결과로 오인하지 않게 던진다.
  const text = await res.text();
  let data: {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: { item?: unknown } | '' };
    };
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(`대장 API 비정상 응답: ${text.slice(0, 120)}`);
  }
  const resultCode = data.response?.header?.resultCode;
  if (resultCode !== '00')
    throw new Error(`대장 API 오류: ${resultCode} ${data.response?.header?.resultMsg}`);
  const items = data.response?.body?.items;
  const item = items ? items.item : undefined;
  if (!item) return [];
  return (Array.isArray(item) ? item : [item]) as Array<Record<string, unknown>>;
}

async function main(): Promise<void> {
  const apiKey = process.env.VISION_BLDG_LEDGER_KEY || process.env.G2B_API_KEY;
  if (!apiKey) throw new Error('VISION_BLDG_LEDGER_KEY(또는 G2B_API_KEY)가 .env 에 없습니다.');
  const dir = join(process.cwd(), 'data', 'market');
  const contracts = readFileSync(join(dir, 'g2b-demolition.jsonl'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as PublicDemolitionContract);
  const index = buildLegalDongIndex(await loadLegalDongCsv(dir));

  const targets = contracts
    .filter((c) => !c.partial)
    .map((c) => ({ c, j: parseJibun(c.name) }))
    .flatMap(({ c, j }) => {
      const dong = j ? resolveLegalDong(j.word, c.agency, index) : undefined;
      return j && dong ? [{ c, j, code: dong.code }] : [];
    })
    // 최근 계약부터 — 오래된 건물일수록 대장이 이미 말소돼 안 붙는다.
    .sort((a, b) => (b.c.contractDate ?? '').localeCompare(a.c.contractDate ?? ''));
  console.log(`지번 해석 성공 ${targets.length}건 — 건축물대장 조회 시작`);

  let done = 0;
  let linked = 0;
  let failed = 0;
  let firstError: string | undefined;
  const queue = [...targets];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          const target = t;
          const items = await withRetry(() => fetchTitle(apiKey, target.code, target.j));
          const facts = ledgerFacts(items, t.j.multiBuilding);
          if (facts) {
            t.c.areaM2 = facts.areaM2;
            t.c.structure = facts.structure ?? t.c.structure;
            linked++;
          }
        } catch (e) {
          failed++;
          firstError ??= e instanceof Error ? e.message : String(e);
        }
        await new Promise((r) => setTimeout(r, CALL_GAP_MS));
        if (++done % 200 === 0) console.log(`${done}/${targets.length} (연결 ${linked})`);
      }
    }),
  );

  const linkedRows = targets.map((t) => t.c).filter((c) => c.areaM2);
  const priced = linkedRows.filter((c) => contractPricePerSqm(c) !== undefined);
  const summary = {
    linkedAt: new Date().toISOString(),
    parsedJibun: targets.length,
    ledgerFound: linked,
    requestErrors: failed,
    withPerSqm: priced.length,
    perSqmByStructure: summarizePerSqm(linkedRows),
  };
  writeFileSync(
    join(dir, 'g2b-demolition-linked.jsonl'),
    linkedRows.map((c) => JSON.stringify(c)).join('\n'),
  );
  writeFileSync(join(dir, 'summary-linked.json'), JSON.stringify(summary, null, 2));
  console.log(
    `대장 연결 ${linked}건 · ㎡당 단가 계산 가능 ${priced.length}건 · 요청 오류 ${failed}건`,
  );
  if (firstError) console.log(`첫 오류: ${firstError}`);
  console.table(summary.perSqmByStructure);
}

if (process.argv[1]?.endsWith('link-ledger.ts') || process.argv[1]?.endsWith('link-ledger.js')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
