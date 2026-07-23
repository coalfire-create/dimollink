import serverless from 'serverless-http';
import { createApp } from '../../apps/api/dist/app.js';
import { RedisOtpKv } from '../../apps/api/dist/auth/redis-otp-kv.js';
import { RedisSessionStore } from '../../apps/api/dist/auth/redis-session-store.js';
import { StatelessSessionStore } from '../../apps/api/dist/auth/stateless-session-store.js';
import { PgOtpKv, ensureOtpSchema } from '../../apps/api/dist/auth/pg-otp-kv.js';
import { env } from '../../apps/api/dist/config/env.js';
import { jsonPersistenceFactory } from '../../apps/api/dist/lib/json-collection.js';
import { createPgPool, initPgPersistence } from '../../apps/api/dist/lib/pg-collection.js';
import { createUpstashRedis } from '../../apps/api/dist/lib/redis.js';
import { RedisRateLimitStore } from '../../apps/api/dist/middleware/redis-rate-limit-store.js';

/**
 * Netlify Functions 진입점 — Express 앱을 serverless-http 로 감싼다.
 * 서버리스라 공유 상태(세션·OTP·레이트리밋)는 인스턴스 밖 저장소가 필요하다:
 *  - 영속·OTP: Neon Postgres(DATABASE_URL) — Upstash 없이 동작.
 *  - 세션: Upstash(설정 시) 또는 무상태 서명(SESSION_SECRET).
 * 콜드스타트 시 1회 초기화(핸들러 메모이즈).
 */
let handlerPromise;

async function buildHandler() {
  const ttlMs = env.auth.sessionTtlDays * 24 * 60 * 60 * 1000;
  const shared = {};

  let persistence;
  if (env.databaseUrl) {
    const pool = createPgPool(env.databaseUrl);
    persistence = await initPgPersistence(pool);
    // OTP(문자인증) 상태를 Postgres 로 공유 — 서버리스에서 인스턴스 간 유지.
    await ensureOtpSchema(pool);
    shared.otpKv = new PgOtpKv(pool);
  } else {
    persistence = jsonPersistenceFactory(env.dataDir);
  }

  if (env.upstash.restUrl && env.upstash.restToken) {
    const redis = createUpstashRedis(env.upstash.restUrl, env.upstash.restToken);
    shared.sessionStore = new RedisSessionStore(redis, ttlMs);
    shared.rateLimitStore = new RedisRateLimitStore(redis);
    if (!shared.otpKv) shared.otpKv = new RedisOtpKv(redis);
  } else if (env.auth.sessionSecret) {
    // 무상태 서명 세션 — 서버리스에서 공유 저장소 없이 동작.
    shared.sessionStore = new StatelessSessionStore(env.auth.sessionSecret, ttlMs);
  }

  return serverless(createApp(persistence, shared));
}

export const handler = async (event, context) => {
  handlerPromise ??= buildHandler();
  const h = await handlerPromise;
  return h(event, context);
};
