import { describe, expect, it, vi } from 'vitest';

// @upstash/redis 를 인메모리 목으로 대체 — 실제 네트워크 없이 어댑터 매핑만 검증.
const calls: Array<{ method: string; args: unknown[] }> = [];
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(public opts: unknown) {}
    get(key: string) {
      calls.push({ method: 'get', args: [key] });
      return Promise.resolve(this.store.get(key) ?? null);
    }
    set(key: string, value: string, opts?: unknown) {
      calls.push({ method: 'set', args: [key, value, opts] });
      this.store.set(key, value);
      return Promise.resolve('OK');
    }
    del(key: string) {
      calls.push({ method: 'del', args: [key] });
      this.store.delete(key);
      return Promise.resolve(1);
    }
    incr(key: string) {
      calls.push({ method: 'incr', args: [key] });
      const next = Number(this.store.get(key) ?? '0') + 1;
      this.store.set(key, String(next));
      return Promise.resolve(next);
    }
    pexpire(key: string, ms: number) {
      calls.push({ method: 'pexpire', args: [key, ms] });
      return Promise.resolve(1);
    }
    pttl(key: string) {
      calls.push({ method: 'pttl', args: [key] });
      return Promise.resolve(this.store.has(key) ? 1000 : -2);
    }
    private store = new Map<string, string>();
  },
}));

const { createUpstashRedis } = await import('./redis.js');

describe('createUpstashRedis (RedisLike 어댑터)', () => {
  it('set{PX}→px 로 매핑하고 get 은 문자열을 반환한다', async () => {
    calls.length = 0;
    const redis = createUpstashRedis('https://x.upstash.io', 'token');
    await redis.set('otp:010', '123456', { PX: 180000 });
    expect(await redis.get('otp:010')).toBe('123456');

    const setCall = calls.find((c) => c.method === 'set');
    expect(setCall?.args[2]).toEqual({ px: 180000 });
  });

  it('없는 키는 null, incr/pTTL/del 이 동작한다', async () => {
    const redis = createUpstashRedis('https://x.upstash.io', 'token');
    expect(await redis.get('missing')).toBeNull();
    expect(await redis.incr('cnt')).toBe(1);
    expect(await redis.incr('cnt')).toBe(2);
    await redis.set('k', 'v');
    expect(await redis.pTTL('k')).toBe(1000);
    await redis.del('k');
    expect(await redis.get('k')).toBeNull();
  });

  it('PX 미지정 set 은 옵션 없이 호출한다', async () => {
    calls.length = 0;
    const redis = createUpstashRedis('https://x.upstash.io', 'token');
    await redis.set('k', 'v');
    const setCall = calls.find((c) => c.method === 'set');
    expect(setCall?.args[2]).toBeUndefined();
  });
});
