import { describe, expect, it } from 'vitest';
import type { RedisLike } from '../lib/redis.js';
import { RedisSessionStore } from './redis-session-store.js';

/** TTL 은 무시하는 최소 인메모리 가짜 Redis. */
function fakeRedis(): RedisLike {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    incr: async (k) => {
      const n = Number(m.get(k) ?? '0') + 1;
      m.set(k, String(n));
      return n;
    },
    pExpire: async () => undefined,
    pTTL: async () => 60_000,
  };
}

describe('RedisSessionStore', () => {
  it('발급→조회→회수 (다중 인스턴스 공유 저장소)', async () => {
    const store = new RedisSessionStore(fakeRedis(), 1000);
    const token = await store.issue('user-1');
    expect(await store.resolve(token)).toBe('user-1');
    await store.revoke(token);
    expect(await store.resolve(token)).toBeUndefined();
  });

  it('같은 Redis 를 공유하는 다른 인스턴스에서도 세션이 조회된다', async () => {
    const redis = fakeRedis();
    const instanceA = new RedisSessionStore(redis, 1000);
    const instanceB = new RedisSessionStore(redis, 1000);
    const token = await instanceA.issue('user-2');
    expect(await instanceB.resolve(token)).toBe('user-2');
  });

  it('알 수 없는 토큰은 undefined', async () => {
    const store = new RedisSessionStore(fakeRedis(), 1000);
    expect(await store.resolve('nope')).toBeUndefined();
  });
});
