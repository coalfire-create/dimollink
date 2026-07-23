import serverless from 'serverless-http';
import { createApp } from '../../apps/api/dist/app.js';
import { RedisOtpKv } from '../../apps/api/dist/auth/redis-otp-kv.js';
import { RedisSessionStore } from '../../apps/api/dist/auth/redis-session-store.js';
import { StatelessSessionStore } from '../../apps/api/dist/auth/stateless-session-store.js';
import { env } from '../../apps/api/dist/config/env.js';
import { jsonPersistenceFactory } from '../../apps/api/dist/lib/json-collection.js';
import { createPgPool, initPgPersistence } from '../../apps/api/dist/lib/pg-collection.js';
import { createUpstashRedis } from '../../apps/api/dist/lib/redis.js';
import { RedisRateLimitStore } from '../../apps/api/dist/middleware/redis-rate-limit-store.js';

/**
 * Netlify Functions 진입점 — Express 앱을 serverless-http 로 감싼다.
 * 서버리스라 세션·OTP·레이트리밋은 Upstash(REST) 또는 무상태(SESSION_SECRET)로만 공유.
 * 콜드스타트 시 1회 초기화(핸들러 메모이즈).
 */
let handlerPromise;

async function buildHandler() {
  const persistence = env.databaseUrl
    ? await initPgPersistence(createPgPool(env.databaseUrl))
    : jsonPersistenceFactory(env.dataDir);

  const ttlMs = env.auth.sessionTtlDays * 24 * 60 * 60 * 1000;
  let shared = {};
  if (env.upstash.restUrl && env.upstash.restToken) {
    const redis = createUpstashRedis(env.upstash.restUrl, env.upstash.restToken);
    shared = {
      sessionStore: new RedisSessionStore(redis, ttlMs),
      rateLimitStore: new RedisRateLimitStore(redis),
      otpKv: new RedisOtpKv(redis),
    };
  } else if (env.auth.sessionSecret) {
    shared = { sessionStore: new StatelessSessionStore(env.auth.sessionSecret, ttlMs) };
  }

  return serverless(createApp(persistence, shared));
}

export const handler = async (event, context) => {
  handlerPromise ??= buildHandler();
  const h = await handlerPromise;
  return h(event, context);
};
