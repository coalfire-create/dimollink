import pg from 'pg';
import {
  defaultKeyOf,
  type CollectionPersistence,
  type PersistenceFactory,
} from './json-collection.js';

/**
 * PostgreSQL 영속화 어댑터 — Stateless 아키텍처용.
 * 메모리 캐시 없이 매 요청마다 DB에 쿼리를 실행합니다.
 */

export const COLLECTION_NAMES = [
  'notifications',
  'requests',
  'users',
  'credentials',
  'sessions',
  'reviews',
  'incidents',
  'quotes',
  'offers',
  'chat',
  'payments',
  'interior-requests',
  'interior-bids',
] as const;

export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export class PgEntityStore<T> implements CollectionPersistence<T> {
  constructor(
    private readonly pool: PgQueryable,
    private readonly name: string,
    private readonly keyOf: (item: T) => string,
  ) {}

  async get(id: string): Promise<T | undefined> {
    const { rows } = await this.pool.query(
      `SELECT data FROM entities WHERE collection = $1 AND id = $2`,
      [this.name, id],
    );
    const row = rows[0];
    if (!row) return undefined;
    return row.data as T;
  }

  async list(): Promise<T[]> {
    const { rows } = await this.pool.query(
      `SELECT data FROM entities WHERE collection = $1 ORDER BY updated_at DESC`,
      [this.name],
    );
    return rows.map((row) => row.data as T);
  }

  /** 최상위 필드 완전일치를 jsonb 포함(@>) 조건으로 내려 인덱스로 거른다. */
  async listBy(equals: Record<string, string>): Promise<T[]> {
    const entries = Object.entries(equals).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return this.list();
    const filter = Object.fromEntries(entries);
    const { rows } = await this.pool.query(
      `SELECT data FROM entities
        WHERE collection = $1 AND data @> $2::jsonb
        ORDER BY updated_at DESC`,
      [this.name, JSON.stringify(filter)],
    );
    return rows.map((row) => row.data as T);
  }

  async save(item: T): Promise<void> {
    const id = this.keyOf(item);
    await this.pool.query(
      `INSERT INTO entities(collection, id, data, updated_at)
       VALUES($1, $2, $3::jsonb, now())
       ON CONFLICT(collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [this.name, id, JSON.stringify(item)],
    );
  }

  async saveAll(items: T[]): Promise<void> {
    // 트랜잭션 없이 순차 실행 (단순화)
    // 운영 환경에서는 Batch Insert/트랜잭션 최적화가 필요할 수 있음
    for (const item of items) {
      await this.save(item);
    }
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM entities WHERE collection = $1 AND id = $2`,
      [this.name, id],
    );
  }
}

/** 스키마 보장 후 PostgreSQL 영속화 팩토리를 반환합니다. */
export async function initPgPersistence(
  pool: PgQueryable,
  _names: readonly string[] = COLLECTION_NAMES,
): Promise<PersistenceFactory> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS entities(
       collection text NOT NULL,
       id text NOT NULL,
       data jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY(collection, id)
     )`,
  );
  // 목록 조회 인덱스 — list() 의 collection + updated_at 정렬을 인덱스 스캔으로 처리한다.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS entities_collection_updated_idx
       ON entities(collection, updated_at DESC)`,
  );
  // listBy() 의 jsonb 포함(@>) 조건용 GIN 인덱스 — 상태·종류로 좁히는 목록 조회에 쓴다.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS entities_data_gin_idx ON entities USING GIN(data jsonb_path_ops)`,
  );

  // 부팅 시 데이터를 미리 불러오지 않고 팩토리만 반환합니다.
  return <T>(name: string, keyOf: (item: T) => string = defaultKeyOf): CollectionPersistence<T> =>
    new PgEntityStore<T>(pool, name, keyOf);
}

export function createPgPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}
