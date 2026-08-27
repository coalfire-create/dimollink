import { describe, expect, it, vi } from 'vitest';
import { PgEntityStore, initPgPersistence, type PgQueryable } from './pg-collection.js';

/** 쿼리 로그를 남기는 가짜 Pool. SELECT 는 지정 rows 반환. */
function fakePool(
  rows: Array<Record<string, unknown>> = [],
): PgQueryable & { calls: Array<{ text: string; params?: unknown[] }> } {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    calls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      return { rows: text.includes('SELECT') ? rows : [] };
    }),
  };
}

describe('initPgPersistence (엔티티 행 단위, stateless)', () => {
  it('entities 테이블을 보장하고 컬렉션별 스토어 팩토리를 반환한다', async () => {
    const pool = fakePool([{ data: { id: 'u1' } }, { data: { id: 'u2' } }]);
    const factory = await initPgPersistence(pool, ['users', 'requests']);

    expect(pool.calls.some((c) => c.text.includes('CREATE TABLE IF NOT EXISTS entities'))).toBe(true);
    // 매 조회는 DB 에 질의한다(부팅 프리로드 없음).
    expect(await factory<{ id: string }>('users').list()).toEqual([{ id: 'u1' }, { id: 'u2' }]);
  });
});

describe('PgEntityStore', () => {
  it('save 는 collection·id 기준으로 upsert(INSERT ... ON CONFLICT) 한다', async () => {
    const pool = fakePool();
    const store = new PgEntityStore<{ id: string; v: number }>(pool, 'users', (x) => x.id);

    await store.save({ id: 'a', v: 1 });

    const upsert = pool.calls.find((c) => c.text.includes('INSERT INTO entities'));
    expect(upsert?.text).toContain('ON CONFLICT');
    expect(upsert?.params?.[0]).toBe('users');
    expect(upsert?.params?.[1]).toBe('a');
    expect(upsert?.params?.[2]).toBe(JSON.stringify({ id: 'a', v: 1 }));
  });

  it('saveAll 은 각 항목을 순차 upsert 한다', async () => {
    const pool = fakePool();
    const store = new PgEntityStore<{ id: string }>(pool, 'users', (x) => x.id);

    await store.saveAll([{ id: 'a' }, { id: 'b' }]);

    const upserts = pool.calls.filter((c) => c.text.includes('INSERT INTO entities'));
    expect(upserts).toHaveLength(2);
    expect(upserts.map((c) => c.params?.[1])).toEqual(['a', 'b']);
  });

  it('get 은 단건 조회, 없으면 undefined', async () => {
    const found = new PgEntityStore<{ id: string; v: number }>(
      fakePool([{ data: { id: 'a', v: 1 } }]),
      'users',
      (x) => x.id,
    );
    expect(await found.get('a')).toEqual({ id: 'a', v: 1 });

    const missing = new PgEntityStore<{ id: string }>(fakePool([]), 'users', (x) => x.id);
    expect(await missing.get('nope')).toBeUndefined();
  });

  it('list 는 컬렉션의 모든 data 를 반환한다', async () => {
    const store = new PgEntityStore<{ id: string }>(
      fakePool([{ data: { id: 'a' } }, { data: { id: 'b' } }]),
      'users',
      (x) => x.id,
    );
    expect(await store.list()).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('delete 는 collection·id 로 삭제한다', async () => {
    const pool = fakePool();
    const store = new PgEntityStore<{ id: string }>(pool, 'users', (x) => x.id);

    await store.delete('a');

    const del = pool.calls.find((c) => c.text.includes('DELETE FROM entities'));
    expect(del?.params).toEqual(['users', 'a']);
  });
});
