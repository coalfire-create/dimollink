import { randomUUID } from 'node:crypto';
import type { RedisLike } from '../lib/redis.js';
import type { SessionStore } from './session-store.js';

/**
 * Redis 기반 세션 저장소 — 다중 인스턴스에서 세션을 공유한다.
 * 토큰을 키로 회원 id 를 저장(만료 TTL 포함)하고, 매 요청 시 Redis 에서 실시간 조회한다.
 * 토큰은 보안 값 — 로그에 남기지 않는다.
 */
export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly ttlMs: number,
  ) {}

  private key(token: string): string {
    return `sess:${token}`;
  }

  async issue(userId: string): Promise<string> {
    const token = randomUUID();
    await this.redis.set(this.key(token), userId, { PX: this.ttlMs });
    return token;
  }

  async resolve(token: string): Promise<string | undefined> {
    return (await this.redis.get(this.key(token))) ?? undefined;
  }

  async revoke(token: string): Promise<void> {
    await this.redis.del(this.key(token));
  }
}
