import { describe, expect, it, vi } from 'vitest';
import { PgCollectionStore, initPgPersistence, type PgQueryable } from './pg-collection.js';

/** 쿼리 로그를 남기는 가짜 Pool. */
function fakePool(rows: Array<Record<string, unknown>> = []): PgQueryable & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    query: vi.fn(async (text: string) => {
      calls.push(text);
      return { rows: text.includes('SELECT') ? rows : [] };
    }),
  };
}

describe('initPgPersistence', () => {
  it('스키마 생성 후 저장된 컬렉션을 프리로드한다', async () => {
    const pool = fakePool([{ name: 'users', data: [{ id: 'u1' }] }]);
    const factory = await initPgPersistence(pool, ['users', 'requests']);

    expect(pool.calls.some((q) => q.includes('CREATE TABLE IF NOT EXISTS kv_collections'))).toBe(true);
    const users = factory<{ id: string }>('users');
    expect(users.load()).toEqual([{ id: 'u1' }]);
    // 저장된 적 없는 컬렉션은 빈 배열.
    expect(factory('requests').load()).toEqual([]);
  });
});

describe('PgCollectionStore', () => {
  it('save 는 캐시를 갱신하고 upsert 를 백그라운드로 실행한다', async () => {
    const pool = fakePool();
    const store = new PgCollectionStore<{ id: string }>(pool, 'users', []);

    store.save([{ id: 'a' }]);
    expect(store.load()).toEqual([{ id: 'a' }]); // 캐시 즉시 반영(동기)

    // 백그라운드 쓰기 완료 대기.
    await new Promise((r) => setTimeout(r, 0));
    expect((pool.query as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO kv_collections'),
      ['users', JSON.stringify([{ id: 'a' }])],
    );
  });

  it('쓰기 실패해도 예외를 던지지 않는다(로그만)', async () => {
    const pool: PgQueryable = { query: vi.fn(async () => { throw new Error('db down'); }) };
    const store = new PgCollectionStore(pool, 'users', []);
    expect(() => store.save([{ id: 'a' }])).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
