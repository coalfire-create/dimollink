import pg from 'pg';
import {
  defaultKeyOf,
  type CollectionPersistence,
  type PersistenceFactory,
} from './json-collection.js';

/**
 * PostgreSQL 영속화 어댑터 — 엔티티(행) 단위 저장.
 *
 * 각 엔티티를 entities(collection, id, data jsonb) 테이블의 한 행으로 저장한다.
 * 부팅 시 컬렉션 전체를 메모리로 프리로드해 동기 인터페이스(load/save)를 만족시키고,
 * save 는 변경 엔티티만 백그라운드로 upsert 한다.
 *
 * 장점(통짜 JSONB 대비): 서로 다른 엔티티를 동시에 쓰는 인스턴스끼리 클로버링하지 않음
 *   (행 단위 upsert). 같은 엔티티 동시 쓰기는 last-write-wins.
 * 한계: 여전히 컬렉션 전체를 메모리 캐시로 들고, 필드 단위 컬럼/인덱스는 없음(대규모 시 정규화 필요).
 *   현재 앱은 하드 삭제가 없으므로(취소/정지는 상태 전이) 삭제 전파는 다루지 않는다.
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

export class PgEntityStore<T> implements CollectionPersistence<T> {
  private cache: T[];
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly pool: PgQueryable,
    private readonly name: string,
    initial: T[],
    private readonly keyOf: (item: T) => string,
  ) {
    this.cache = initial;
  }

  load(): T[] {
    return this.cache;
  }

  save(items: T[]): void {
    // 이전 캐시 대비 변경/추가된 엔티티만 골라 행 단위 upsert(전체 재작성 안 함).
    const prev = new Map(this.cache.map((it) => [this.keyOf(it), JSON.stringify(it)]));
    const changed: T[] = [];
    for (const item of items) {
      const key = this.keyOf(item);
      const serialized = JSON.stringify(item);
      if (prev.get(key) !== serialized) changed.push(item);
    }
    this.cache = items;
    if (changed.length === 0) return;

    this.writeChain = this.writeChain.then(async () => {
      for (const item of changed) {
        try {
          await this.pool.query(
            `INSERT INTO entities(collection, id, data, updated_at)
             VALUES($1, $2, $3::jsonb, now())
             ON CONFLICT(collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [this.name, this.keyOf(item), JSON.stringify(item)],
          );
        } catch (err) {
          console.error(
            `[pg] '${this.name}' 엔티티 저장 실패`,
            err instanceof Error ? err.message : 'error',
          );
        }
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
    `CREATE TABLE IF NOT EXISTS entities(
       collection text NOT NULL,
       id text NOT NULL,
       data jsonb NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY(collection, id)
     )`,
  );
  const preloaded = new Map<string, unknown[]>();
  for (const name of names) preloaded.set(name, []);
  const { rows } = await pool.query(
    `SELECT collection, data FROM entities WHERE collection = ANY($1)`,
    [[...names]],
  );
  for (const row of rows) {
    const list = preloaded.get(row.collection as string);
    if (list) list.push(row.data);
  }
  return <T>(name: string, keyOf: (item: T) => string = defaultKeyOf): CollectionPersistence<T> =>
    new PgEntityStore<T>(pool, name, (preloaded.get(name) as T[] | undefined) ?? [], keyOf);
}

/** 운영용 pg Pool 생성(연결 문자열 기반). */
export function createPgPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}
