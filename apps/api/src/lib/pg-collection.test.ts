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

/**
 * 목록 조회를 SQL 로 좁히는 경로 — 컬렉션 전량을 로드해 메모리에서 거르면
 * 요청이 쌓일수록 일감 피드가 선형으로 느려진다.
 */
describe('PgEntityStore.listBy (조건 푸시다운)', () => {
  it('완전일치 조건을 jsonb 포함(@>) 으로 내려보낸다', async () => {
    const pool = fakePool([{ data: { id: 'r1', kind: 'DEMOLITION' } }]);
    const store = new PgEntityStore<{ id: string }>(pool, 'requests', (x) => x.id);

    const out = await store.listBy({ kind: 'DEMOLITION', status: 'REQUESTED' });

    expect(out).toEqual([{ id: 'r1', kind: 'DEMOLITION' }]);
    const select = pool.calls.find((c) => c.text.includes('SELECT'));
    expect(select?.text).toContain('data @> $2::jsonb');
    expect(select?.params?.[0]).toBe('requests');
    expect(JSON.parse(String(select?.params?.[1]))).toEqual({
      kind: 'DEMOLITION',
      status: 'REQUESTED',
    });
  });

  it('조건이 없으면 전체 목록 질의로 떨어진다', async () => {
    const pool = fakePool([]);
    const store = new PgEntityStore<{ id: string }>(pool, 'requests', (x) => x.id);

    await store.listBy({});

    const select = pool.calls.find((c) => c.text.includes('SELECT'));
    expect(select?.text).not.toContain('@>');
    expect(select?.text).toContain('WHERE collection = $1');
  });

  it('목록 조회·jsonb 조건용 인덱스를 기동 시 함께 만든다', async () => {
    const pool = fakePool([]);
    await initPgPersistence(pool);
    const sql = pool.calls.map((c) => c.text).join('\n');
    expect(sql).toContain('entities_collection_updated_idx');
    expect(sql).toContain('USING GIN(data jsonb_path_ops)');
  });
});
