import { createApp } from '../apps/api/dist/app.js';
import { RedisOtpKv } from '../apps/api/dist/auth/redis-otp-kv.js';
import { RedisSessionStore } from '../apps/api/dist/auth/redis-session-store.js';
import { env } from '../apps/api/dist/config/env.js';
import { jsonPersistenceFactory } from '../apps/api/dist/lib/json-collection.js';
import { createPgPool, initPgPersistence } from '../apps/api/dist/lib/pg-collection.js';
import { createRedisClient } from '../apps/api/dist/lib/redis.js';
import { RedisRateLimitStore } from '../apps/api/dist/middleware/redis-rate-limit-store.js';

// 서버리스(임시 FS·다중 인스턴스)에서는 PostgreSQL·Redis 가 사실상 필수.
const persistence = env.databaseUrl
  ? await initPgPersistence(createPgPool(env.databaseUrl))
  : jsonPersistenceFactory(env.dataDir);

let shared = {};
if (env.redisUrl) {
  const redis = await createRedisClient(env.redisUrl);
  shared = {
    sessionStore: new RedisSessionStore(redis, env.auth.sessionTtlDays * 24 * 60 * 60 * 1000),
    rateLimitStore: new RedisRateLimitStore(redis),
    otpKv: new RedisOtpKv(redis),
  };
}

export default createApp(persistence, shared);
