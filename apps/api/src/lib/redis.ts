import { createClient } from 'redis';

/**
 * 최소 Redis 인터페이스 — 다중 인스턴스 공유 상태(세션·레이트리밋)에 사용한다.
 * 테스트에서 인메모리 가짜 구현으로 대체할 수 있도록 필요한 명령만 노출한다.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { PX?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  pExpire(key: string, ms: number): Promise<unknown>;
  pTTL(key: string): Promise<number>;
}

/** 운영용 Redis 클라이언트 생성(연결까지 완료). */
export async function createRedisClient(url: string): Promise<RedisLike> {
  const client = createClient({ url });
  client.on('error', (err) =>
    console.error('[redis] 연결 오류', err instanceof Error ? err.message : 'error'),
  );
  await client.connect();
  return client as unknown as RedisLike;
}
