import { describe, expect, it } from 'vitest';
import { PgOtpKv, type PgQueryable } from './pg-otp-kv.js';
import type { OtpEntry } from './otp-service.js';

/**
 * otp_kv 테이블을 흉내내는 인메모리 pg 시뮬레이터.
 * 실제 PostgreSQL 의미(만료 필터·upsert·삭제)를 재현해 PgOtpKv 로직을 검증한다.
 */
function fakePool(clock: { now: number }): PgQueryable {
  const store = new Map<string, { data: unknown; expiresAt: number }>();
  return {
    async query(text: string, params: unknown[] = []) {
      if (text.includes('CREATE TABLE')) return { rows: [] };
      if (text.startsWith('INSERT')) {
        const [kind, key, dataJson, ttl] = params as [string, string, string, string];
        store.set(`${kind}:${key}`, { data: JSON.parse(dataJson), expiresAt: clock.now + Number(ttl) });
        return { rows: [] };
      }
      if (text.startsWith('SELECT')) {
        const [kind, key] = params as [string, string];
        const row = store.get(`${kind}:${key}`);
        if (row && row.expiresAt > clock.now) return { rows: [{ data: row.data }] };
        return { rows: [] };
      }
      if (text.startsWith('DELETE')) {
        const [kind, key] = params as [string, string];
        store.delete(`${kind}:${key}`);
        for (const [k, v] of store) if (v.expiresAt <= clock.now) store.delete(k);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

const entry: OtpEntry = { code: '123456', expiresAt: 999, attempts: 0, sentAt: 100 };

describe('PgOtpKv', () => {
  it('pending 저장→조회→삭제', async () => {
    const clock = { now: 1000 };
    const kv = new PgOtpKv(fakePool(clock));
    await kv.setPending('01011112222', entry, 180_000);
    expect(await kv.getPending('01011112222')).toEqual(entry);
    await kv.deletePending('01011112222');
    expect(await kv.getPending('01011112222')).toBeUndefined();
  });

  it('TTL 경과 후 pending 은 조회되지 않는다(만료)', async () => {
    const clock = { now: 1000 };
    const kv = new PgOtpKv(fakePool(clock));
    await kv.setPending('01011112222', entry, 5_000);
    clock.now += 6_000;
    expect(await kv.getPending('01011112222')).toBeUndefined();
  });

  it('verified 만료시각을 숫자로 저장·조회', async () => {
    const clock = { now: 1000 };
    const kv = new PgOtpKv(fakePool(clock));
    const expiresAt = clock.now + 600_000;
    await kv.setVerified('01011112222', expiresAt, 600_000);
    expect(await kv.getVerifiedExpiry('01011112222')).toBe(expiresAt);
    await kv.deleteVerified('01011112222');
    expect(await kv.getVerifiedExpiry('01011112222')).toBeUndefined();
  });

  it('같은 번호 재발송 시 덮어쓴다(upsert)', async () => {
    const clock = { now: 1000 };
    const kv = new PgOtpKv(fakePool(clock));
    await kv.setPending('01011112222', entry, 180_000);
    const entry2: OtpEntry = { ...entry, code: '654321' };
    await kv.setPending('01011112222', entry2, 180_000);
    expect((await kv.getPending('01011112222'))?.code).toBe('654321');
  });
});
