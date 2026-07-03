import { createApp } from '../apps/api/dist/app.js';
import { RedisOtpKv } from '../apps/api/dist/auth/redis-otp-kv.js';
import { RedisSessionStore } from '../apps/api/dist/auth/redis-session-store.js';
import { StatelessSessionStore } from '../apps/api/dist/auth/stateless-session-store.js';
import { env } from '../apps/api/dist/config/env.js';
import { jsonPersistenceFactory } from '../apps/api/dist/lib/json-collection.js';
import { createPgPool, initPgPersistence } from '../apps/api/dist/lib/pg-collection.js';
import { createRedisClient } from '../apps/api/dist/lib/redis.js';
import { RedisRateLimitStore } from '../apps/api/dist/middleware/redis-rate-limit-store.js';

// 데이터: PostgreSQL(DATABASE_URL) 설정 시 영속, 아니면 임시(서버리스 휘발).
const persistence = env.databaseUrl
  ? await initPgPersistence(createPgPool(env.databaseUrl))
  : jsonPersistenceFactory(env.dataDir);

// 세션: Redis > 무상태(SESSION_SECRET) > 인메모리. 서버리스는 Redis 또는 SESSION_SECRET 필요.
const sessionTtlMs = env.auth.sessionTtlDays * 24 * 60 * 60 * 1000;
let shared = {};
if (env.redisUrl) {
  const redis = await createRedisClient(env.redisUrl);
  shared = {
    sessionStore: new RedisSessionStore(redis, sessionTtlMs),
    rateLimitStore: new RedisRateLimitStore(redis),
    otpKv: new RedisOtpKv(redis),
  };
} else if (env.auth.sessionSecret) {
  shared = { sessionStore: new StatelessSessionStore(env.auth.sessionSecret, sessionTtlMs) };
}

export default createApp(persistence, shared);
