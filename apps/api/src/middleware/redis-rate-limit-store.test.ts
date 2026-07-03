import { describe, expect, it } from 'vitest';
import type { RedisLike } from '../lib/redis.js';
import { RedisRateLimitStore } from './redis-rate-limit-store.js';

function fakeRedis(): RedisLike {
  const m = new Map<string, number>();
  return {
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
    incr: async (k) => {
      const n = (m.get(k) ?? 0) + 1;
      m.set(k, n);
      return n;
    },
    pExpire: async () => undefined,
    pTTL: async () => 45_000,
  };
}

describe('RedisRateLimitStore', () => {
  it('히트마다 카운트가 증가하고 첫 히트는 윈도를 반환', async () => {
    const store = new RedisRateLimitStore(fakeRedis());
    expect(await store.hit('1.2.3.4', 60_000)).toEqual({ count: 1, resetMs: 60_000 });
    expect((await store.hit('1.2.3.4', 60_000)).count).toBe(2);
    expect((await store.hit('1.2.3.4', 60_000)).count).toBe(3);
  });

  it('키(IP)별로 카운트가 분리된다', async () => {
    const store = new RedisRateLimitStore(fakeRedis());
    await store.hit('a', 60_000);
    await store.hit('a', 60_000);
    expect((await store.hit('b', 60_000)).count).toBe(1);
  });
});
