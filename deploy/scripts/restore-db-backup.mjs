#!/usr/bin/env node
/**
 * DB 백업 복원 — `db/dimol-*.ndjson.gz` 덤프를 PostgreSQL 에 되먹인다.
 *
 * ⚠️ 대상 DB 의 같은 키(collection,id) 행을 **덮어쓴다.** 반드시 대상 확인 후 실행할 것.
 *
 * 사용:
 *   # 1) 백업 파일 받기 (관리자 API 로 키 확인 → 콘솔/CLI 로 내려받기)
 *   #    railway bucket ... 또는 관리자 화면에서 받은 파일 경로를 넘긴다.
 *   DATABASE_URL=postgres://... node deploy/scripts/restore-db-backup.mjs ./dimol-20260923-040000.ndjson.gz
 *
 *   # 지우고 새로 넣기(덤프에 없는 행까지 삭제) — 통째 복구할 때만.
 *   DATABASE_URL=... node deploy/scripts/restore-db-backup.mjs --replace ./dump.ndjson.gz
 *
 * 왜 --replace 가 기본이 아닌가: 기본(merge)은 덤프에 있는 것만 되살리므로, 사고 범위가
 * 일부일 때 최근 데이터를 날리지 않는다. 통째 복구는 의도를 밝혀야 한다.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import pg from 'pg';

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const file = args.find((a) => !a.startsWith('--'));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 필요합니다.');
  process.exit(1);
}
if (!file) {
  console.error('복원할 덤프 파일 경로를 인자로 주세요.');
  process.exit(1);
}

const raw = readFileSync(file);
const text = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8');
const lines = text.split('\n').filter((l) => l.trim().length > 0);

const rows = [];
let broken = 0;
for (const line of lines) {
  try {
    const row = JSON.parse(line);
    if (typeof row.collection === 'string' && typeof row.id === 'string') rows.push(row);
    else broken += 1;
  } catch {
    // NDJSON 이라 깨진 줄 하나가 나머지를 막지 않는다 — 세고 넘어간다.
    broken += 1;
  }
}

const target = process.env.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@');
console.log(`대상 DB : ${target}`);
console.log(`덤프    : ${file}`);
console.log(`복원 행 : ${rows.length}건${broken ? ` (읽지 못한 줄 ${broken}건)` : ''}`);
console.log(`모드    : ${replace ? '전체 교체(--replace) — 덤프에 없는 행은 삭제됨' : '병합(덤프에 있는 행만 덮어씀)'}`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise((resolve) => rl.question('정말 복원하시겠습니까? (yes 입력): ', resolve));
rl.close();
if (answer.trim() !== 'yes') {
  console.log('취소됨');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // 스키마는 서버가 기동할 때 만든다. 없으면 여기서도 만들어 준다(빈 DB 로 복구하는 경우).
  await client.query(`CREATE TABLE IF NOT EXISTS entities(
      collection text NOT NULL,
      id text NOT NULL,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(collection, id)
    )`);
  if (replace) await client.query('DELETE FROM entities');

  let done = 0;
  for (const row of rows) {
    await client.query(
      `INSERT INTO entities(collection, id, data, updated_at)
       VALUES($1, $2, $3::jsonb, COALESCE($4::timestamptz, now()))
       ON CONFLICT(collection, id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [row.collection, row.id, JSON.stringify(row.data ?? {}), row.updated_at ?? null],
    );
    done += 1;
    if (done % 500 === 0) console.log(`  ... ${done}/${rows.length}`);
  }
  await client.query('COMMIT');
  console.log(`복원 완료: ${done}행`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('복원 실패 — 변경 사항을 되돌렸습니다.', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
