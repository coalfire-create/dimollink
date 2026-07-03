import { describe, expect, it } from 'vitest';
import type { RedisLike } from '../lib/redis.js';
import { OtpService } from './otp-service.js';
import { RedisOtpKv } from './redis-otp-kv.js';

function fakeRedis(): RedisLike {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    incr: async () => 0,
    pExpire: async () => undefined,
    pTTL: async () => 0,
  };
}

describe('RedisOtpKv + OtpService (다중 인스턴스)', () => {
  it('한 인스턴스에서 발송한 코드를 다른 인스턴스에서 검증할 수 있다', async () => {
    const redis = fakeRedis();
    const opts = { kv: new RedisOtpKv(redis), generateCode: () => '654321', ttlMs: 10_000 };
    const instanceA = new OtpService(opts);
    const instanceB = new OtpService(opts);

    await instanceA.request('01011112222'); // A에서 발송
    expect(await instanceB.verify('01011112222', '654321')).toBe(true); // B에서 검증
    expect(await instanceB.isPhoneVerified('01011112222')).toBe(true);
  });

  it('저장소를 공유하므로 회원가입 게이트도 인스턴스 간 일관', async () => {
    const redis = fakeRedis();
    const kv = new RedisOtpKv(redis);
    const a = new OtpService({ kv, generateCode: () => '111111', ttlMs: 10_000 });
    const b = new OtpService({ kv, ttlMs: 10_000 });
    await a.request('01099998888');
    await a.verify('01099998888', '111111');
    expect(await b.isPhoneVerified('01099998888')).toBe(true);
    await b.consumePhoneVerification('01099998888');
    expect(await a.isPhoneVerified('01099998888')).toBe(false);
  });
});
