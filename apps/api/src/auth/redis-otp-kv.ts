import type { RedisLike } from '../lib/redis.js';
import type { OtpEntry, OtpKv } from './otp-service.js';

/**
 * Redis 기반 OTP 저장소 — 다중 인스턴스에서 인증코드/인증완료 상태를 공유한다.
 * (인스턴스 A에서 코드를 받고 B에서 검증해도 동작.) TTL 로 자동 만료시킨다.
 */
export class RedisOtpKv implements OtpKv {
  constructor(private readonly redis: RedisLike) {}

  private pendingKey(key: string): string {
    return `otp:pending:${key}`;
  }
  private verifiedKey(key: string): string {
    return `otp:verified:${key}`;
  }

  async getPending(key: string): Promise<OtpEntry | undefined> {
    const raw = await this.redis.get(this.pendingKey(key));
    return raw ? (JSON.parse(raw) as OtpEntry) : undefined;
  }

  async setPending(key: string, entry: OtpEntry, ttlMs: number): Promise<void> {
    await this.redis.set(this.pendingKey(key), JSON.stringify(entry), { PX: Math.max(1, ttlMs) });
  }

  async deletePending(key: string): Promise<void> {
    await this.redis.del(this.pendingKey(key));
  }

  async getVerifiedExpiry(key: string): Promise<number | undefined> {
    const raw = await this.redis.get(this.verifiedKey(key));
    return raw ? Number(raw) : undefined;
  }

  async setVerified(key: string, expiresAt: number, ttlMs: number): Promise<void> {
    await this.redis.set(this.verifiedKey(key), String(expiresAt), { PX: Math.max(1, ttlMs) });
  }

  async deleteVerified(key: string): Promise<void> {
    await this.redis.del(this.verifiedKey(key));
  }
}
