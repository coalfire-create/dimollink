import { describe, expect, it, vi } from 'vitest';
import { PgEntityStore, initPgPersistence, type PgQueryable } from './pg-collection.js';

/** 쿼리 로그를 남기는 가짜 Pool. SELECT 는 지정 rows 반환. */
function fakePool(rows: Array<Record<string, unknown>> = []): PgQueryable & { calls: Array<{ text: string; params?: unknown[] }> } {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  return {
    calls,
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params });
      return { rows: text.includes('SELECT') ? rows : [] };
    }),
  };
}

describe('initPgPersistence (엔티티 행 단위)', () => {
  it('entities 테이블 생성 후 컬렉션별로 프리로드', async () => {
    const pool = fakePool([
      { collection: 'users', data: { id: 'u1' } },
      { collection: 'users', data: { id: 'u2' } },
      { collection: 'requests', data: { id: 'r1' } },
    ]);
    const factory = await initPgPersistence(pool, ['users', 'requests']);

    expect(pool.calls.some((c) => c.text.includes('CREATE TABLE IF NOT EXISTS entities'))).toBe(true);
    expect(factory<{ id: string }>('users').load()).toEqual([{ id: 'u1' }, { id: 'u2' }]);
    expect(factory<{ id: string }>('requests').load()).toEqual([{ id: 'r1' }]);
  });
});

describe('PgEntityStore', () => {
  it('save 는 변경된 엔티티만 행 단위로 upsert 한다', async () => {
    const pool = fakePool();
    const store = new PgEntityStore<{ id: string; v: number }>(pool, 'users', [{ id: 'a', v: 1 }], (x) => x.id);

    // a 는 그대로, b 는 신규 → b 만 upsert.
    store.save([{ id: 'a', v: 1 }, { id: 'b', v: 2 }]);
    await new Promise((r) => setTimeout(r, 0));

    const upserts = pool.calls.filter((c) => c.text.includes('INSERT INTO entities'));
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.params?.[1]).toBe('b'); // id
  });

  it('변경 없으면 쓰기하지 않는다', async () => {
    const pool = fakePool();
    const store = new PgEntityStore<{ id: string }>(pool, 'users', [{ id: 'a' }], (x) => x.id);
    store.save([{ id: 'a' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(pool.calls.filter((c) => c.text.includes('INSERT INTO entities'))).toHaveLength(0);
  });

  it('커스텀 키(paymentId 등)로 저장한다', async () => {
    const pool = fakePool();
    const store = new PgEntityStore<{ paymentId: string }>(pool, 'payments', [], (p) => p.paymentId);
    store.save([{ paymentId: 'pay-1' }]);
    await new Promise((r) => setTimeout(r, 0));
    const up = pool.calls.find((c) => c.text.includes('INSERT INTO entities'));
    expect(up?.params?.[1]).toBe('pay-1');
  });

  it('쓰기 실패해도 예외를 던지지 않는다', async () => {
    const pool: PgQueryable = { query: vi.fn(async () => { throw new Error('db down'); }) };
    const store = new PgEntityStore<{ id: string }>(pool, 'users', [], (x) => x.id);
    expect(() => store.save([{ id: 'a' }])).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
