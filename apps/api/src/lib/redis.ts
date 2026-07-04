import { Redis as UpstashClient } from '@upstash/redis';
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

/**
 * Upstash Redis(REST) 어댑터 — 서버리스(Vercel)에서 TCP 연결 대신 사용.
 * 저장값은 원시 문자열이므로 자동 JSON 역직렬화를 끈다(automaticDeserialization: false).
 * 명령 이름 매핑: set{PX}→px, pExpire→pexpire, pTTL→pttl.
 */
export function createUpstashRedis(restUrl: string, restToken: string): RedisLike {
  const client = new UpstashClient({
    url: restUrl,
    token: restToken,
    automaticDeserialization: false,
  });
  return {
    async get(key) {
      return (await client.get<string>(key)) ?? null;
    },
    set(key, value, options) {
      return options?.PX !== undefined
        ? client.set(key, value, { px: options.PX })
        : client.set(key, value);
    },
    del(key) {
      return client.del(key);
    },
    incr(key) {
      return client.incr(key);
    },
    pExpire(key, ms) {
      return client.pexpire(key, ms);
    },
    pTTL(key) {
      return client.pttl(key);
    },
  };
}
