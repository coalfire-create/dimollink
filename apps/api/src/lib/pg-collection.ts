import pg from 'pg';
import type { CollectionPersistence, PersistenceFactory } from './json-collection.js';

/**
 * PostgreSQL 영속화 어댑터.
 *
 * 각 컬렉션을 kv_collections 테이블의 한 행(JSONB 배열)으로 저장한다. 부팅 시 전체를
 * 메모리로 프리로드해 동기 인터페이스(load/save)를 만족시키고, save 는 백그라운드로
 * 직렬화해 upsert 한다(재시작·배포에도 데이터 유지).
 *
 * ⚠️ 컬렉션 단위 전체 저장이라 단일 라이터(단일 인스턴스) 기준이다. 다중 인스턴스
 *   동시 쓰기가 필요하면 엔티티별 행(row) 저장소로 확장한다.
 * ⚠️ save 는 비동기 백그라운드 기록 — 크래시 시 마지막 쓰기 유실 가능(작은 창).
 */

/** 저장 대상 컬렉션 이름(부팅 시 프리로드). */
export const COLLECTION_NAMES = [
  'notifications',
  'requests',
  'users',
  'sessions',
  'reviews',
  'incidents',
  'quotes',
  'offers',
  'chat',
  'payments',
] as const;

/** 테스트에서 모킹 가능한 최소 쿼리 인터페이스. */
export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export class PgCollectionStore<T> implements CollectionPersistence<T> {
  private cache: T[];
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly pool: PgQueryable,
    private readonly name: string,
    initial: T[],
  ) {
    this.cache = initial;
  }

  load(): T[] {
    return this.cache;
  }

  save(items: T[]): void {
    this.cache = items;
    const snapshot = JSON.stringify(items);
    // 컬렉션별 쓰기를 순서 보장(직렬화)하고 실패는 로그만 남긴다(동기 인터페이스 유지).
    this.writeChain = this.writeChain.then(async () => {
      try {
        await this.pool.query(
          `INSERT INTO kv_collections(name, data, updated_at) VALUES($1, $2::jsonb, now())
           ON CONFLICT(name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [this.name, snapshot],
        );
      } catch (err) {
        console.error(`[pg] '${this.name}' 저장 실패`, err instanceof Error ? err.message : 'error');
      }
    });
  }
}

/** 스키마 보장 + 프리로드 후 PostgreSQL 영속화 팩토리를 만든다. */
export async function initPgPersistence(
  pool: PgQueryable,
  names: readonly string[] = COLLECTION_NAMES,
): Promise<PersistenceFactory> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS kv_collections(
       name text PRIMARY KEY,
       data jsonb NOT NULL DEFAULT '[]'::jsonb,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const preloaded = new Map<string, unknown[]>();
  const { rows } = await pool.query(`SELECT name, data FROM kv_collections WHERE name = ANY($1)`, [
    [...names],
  ]);
  for (const row of rows) {
    const name = row.name as string;
    preloaded.set(name, Array.isArray(row.data) ? (row.data as unknown[]) : []);
  }
  return <T>(name: string): CollectionPersistence<T> =>
    new PgCollectionStore<T>(pool, name, (preloaded.get(name) as T[] | undefined) ?? []);
}

/** 운영용 pg Pool 생성(연결 문자열 기반). */
export function createPgPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}
