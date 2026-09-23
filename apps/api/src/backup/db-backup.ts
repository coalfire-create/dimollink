import { gzipSync } from 'node:zlib';
import type { PgQueryable } from '../lib/pg-collection.js';
import { BACKUP_PREFIX, type BackupObject, type BackupStorage } from './backup-storage.js';

/**
 * DB 논리 백업.
 *
 * 왜 pg_dump 가 아닌가: 이 서비스의 데이터는 전부 `entities` 한 테이블(JSONB)에 들어 있다.
 * 스키마는 기동할 때 코드가 다시 만든다. 그래서 행만 있으면 복원이 끝나고, 그 행은 SQL
 * 클라이언트로 그대로 읽을 수 있다. pg_dump 를 쓰면 API 이미지에 postgres 클라이언트를
 * 깔고 버전을 서버와 맞춰야 하는데(메이저 불일치면 덤프가 거부된다), 얻는 게 없다.
 *
 * 형식은 NDJSON + gzip — 한 줄이 한 레코드라, 덤프가 중간에 잘려도 그 줄까지는 살아남고
 * 복원도 한 줄씩 먹일 수 있다. 통짜 JSON 배열은 마지막 괄호가 없으면 전부 못 읽는다.
 *
 * ⚠️ 덤프에는 휴대폰번호·사업자등록번호가 **평문으로** 들어 있다. 비공개 버킷에만 두고,
 *    로그에는 건수·바이트만 남긴다(내용 금지).
 */

/** 한 번에 읽어오는 행 수. 메모리에 전부 올리지 않으려고 키셋 페이지로 넘긴다. */
const PAGE_SIZE = 500;

export interface BackupRow {
  collection: string;
  id: string;
  data: unknown;
  updated_at: string;
}

export interface BackupResult {
  key: string;
  rowCount: number;
  /** gzip 후 크기(바이트). */
  bytes: number;
}

/** `db/dimol-20260923-041500.ndjson.gz` — 날짜가 키에 있어야 목록만 보고 판단할 수 있다. */
export function backupKey(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}` +
    `-${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}${p(kst.getUTCSeconds())}`;
  return `${BACKUP_PREFIX}dimol-${stamp}.ndjson.gz`;
}

/** 키에서 KST 날짜(YYYYMMDD)를 뽑는다. 형식이 다르면 undefined. */
export function backupDateOf(key: string): string | undefined {
  return /dimol-(\d{8})-\d{6}\.ndjson\.gz$/.exec(key)?.[1];
}

/** 한 줄 = 한 레코드. 복원이 그대로 되먹일 수 있는 형태로 고정한다. */
export function serializeRow(row: BackupRow): string {
  return JSON.stringify({
    collection: row.collection,
    id: row.id,
    data: row.data,
    updated_at: row.updated_at,
  });
}

/**
 * 전체 행을 키셋 페이지로 읽어 NDJSON 으로 만든다.
 * 정렬 기준을 기본키(collection,id)로 두는 이유: updated_at 은 백업 도중에도 바뀌어서
 * 같은 행을 두 번 읽거나 건너뛸 수 있다. 기본키는 안 변한다.
 */
export async function exportEntities(pool: PgQueryable): Promise<{ ndjson: string; rowCount: number }> {
  const lines: string[] = [];
  let lastCollection = '';
  let lastId = '';
  for (;;) {
    const { rows } = await pool.query(
      `SELECT collection, id, data, updated_at
         FROM entities
        WHERE (collection, id) > ($1, $2)
        ORDER BY collection, id
        LIMIT ${PAGE_SIZE}`,
      [lastCollection, lastId],
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const r = row as { collection: string; id: string; data: unknown; updated_at: unknown };
      // pg 는 timestamptz 를 Date 로 준다. 직렬화 형식을 ISO 문자열 하나로 고정한다.
      const updatedAt: unknown = r.updated_at;
      lines.push(
        serializeRow({
          collection: r.collection,
          id: r.id,
          data: r.data,
          updated_at:
            updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt),
        }),
      );
      lastCollection = r.collection;
      lastId = r.id;
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return { ndjson: lines.length ? lines.join('\n') + '\n' : '', rowCount: lines.length };
}

/**
 * 보관 기간이 지난 백업 고르기.
 * **항상 최소 한 개는 남긴다** — 백업이 오래돼서 전부 지워지면, 그 시점부터 복구 수단이
 * 0 이 된다(백업이 멈춘 걸 몰랐을 때가 정확히 그 상황이다).
 */
export function expiredKeys(
  objects: readonly BackupObject[],
  retentionDays: number,
  now: Date,
): string[] {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const sorted = [...objects].sort(
    (a, b) => (a.lastModified?.getTime() ?? 0) - (b.lastModified?.getTime() ?? 0),
  );
  const newest = sorted[sorted.length - 1];
  return sorted
    .filter((o) => o.key !== newest?.key && (o.lastModified?.getTime() ?? 0) < cutoff)
    .map((o) => o.key);
}

export interface RunBackupDeps {
  pool: PgQueryable;
  storage: BackupStorage;
  retentionDays: number;
  now?: () => Date;
}

/** 백업 1회 실행: 덤프 → 업로드 → 보관기간 정리. */
export async function runDbBackup(deps: RunBackupDeps): Promise<BackupResult> {
  const now = (deps.now ?? (() => new Date()))();
  const { ndjson, rowCount } = await exportEntities(deps.pool);
  const body = gzipSync(Buffer.from(ndjson, 'utf8'));
  const key = backupKey(now);
  await deps.storage.put(key, body, 'application/gzip');

  // 정리는 업로드 성공 뒤에만. 순서가 바뀌면 새 백업이 실패한 날 옛 백업까지 사라진다.
  const expired = expiredKeys(await deps.storage.list(), deps.retentionDays, now);
  if (expired.length > 0) await deps.storage.remove(expired);

  return { key, rowCount, bytes: body.byteLength };
}
