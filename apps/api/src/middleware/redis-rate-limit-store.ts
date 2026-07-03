import type { RedisLike } from '../lib/redis.js';
import type { RateLimitStore } from './security.js';

/**
 * Redis 기반 레이트리밋 카운터 — 다중 인스턴스에서 IP별 횟수를 공유한다.
 * 첫 히트에서만 TTL(윈도)을 건다(고정 윈도). 원자적 INCR 로 경합을 피한다.
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: RedisLike) {}

  async hit(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
    const redisKey = `rl:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.pExpire(redisKey, windowMs);
      return { count, resetMs: windowMs };
    }
    const ttl = await this.redis.pTTL(redisKey);
    return { count, resetMs: ttl > 0 ? ttl : windowMs };
  }
}
