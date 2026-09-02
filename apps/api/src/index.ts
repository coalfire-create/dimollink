import { createApp, type SharedStores } from './app.js';
import { RedisOtpKv } from './auth/redis-otp-kv.js';
import { PgOtpKv, ensureOtpSchema } from './auth/pg-otp-kv.js';
import { RedisSessionStore } from './auth/redis-session-store.js';
import { StatelessSessionStore } from './auth/stateless-session-store.js';
import { env } from './config/env.js';
import { jsonPersistenceFactory, type PersistenceFactory } from './lib/json-collection.js';
import { createPgPool, initPgPersistence } from './lib/pg-collection.js';
import type { Pool } from 'pg';
import { createRedisClient, createUpstashRedis } from './lib/redis.js';
import { RedisRateLimitStore } from './middleware/redis-rate-limit-store.js';

/**
 * 운영 기동 전 필수 설정 점검. 누락 시 조용히 취약하게 뜨지 않도록 즉시 종료한다.
 * (경고 항목은 중단하지 않고 로그만 남긴다.)
 */
function assertProductionConfig(): void {
  if (!env.isProduction) return;
  const errors: string[] = [];
  if (env.corsOrigins.length === 0) {
    errors.push('CORS_ORIGINS(허용 출처)가 설정되지 않았습니다 — 운영에서는 반드시 지정해야 합니다.');
  }
  if (!env.adminToken) {
    errors.push('ADMIN_TOKEN 이 설정되지 않았습니다 — 백오피스 API 보호에 필요합니다.');
  }
  if (errors.length > 0) {
    console.error('[dimol-api] 운영 설정 오류로 기동을 중단합니다:\n - ' + errors.join('\n - '));
    process.exit(1);
  }
  // 중단하지 않는 경고 — 운영 전 반드시 해소 권장.
  if (!env.databaseUrl) {
    console.warn('[dimol-api] 경고: DATABASE_URL 미설정 — JSON 파일 저장소 사용 중(운영 부적합, 재시작 시 세션·OTP 소실).');
  }
}

/** 저장소 선택 — pg 풀이 있으면 PostgreSQL, 없으면 JSON 파일 폴백. */
async function buildPersistence(pool?: Pool): Promise<PersistenceFactory> {
  if (pool) {
    const factory = await initPgPersistence(pool);
    console.log('[dimol-api] 저장소: PostgreSQL');
    return factory;
  }
  console.log('[dimol-api] 저장소: JSON 파일(.data) — 운영에서는 DATABASE_URL 권장');
  return jsonPersistenceFactory(env.dataDir);
}

/**
 * 공유 상태 구성: 세션·레이트리밋은 Redis(TCP) > Upstash(REST) > 무상태 서명.
 * OTP 는 Redis 없으면 PostgreSQL(풀 있을 때)로 저장 — 서버 재시작·다중 인스턴스에도 유지.
 */
async function buildSharedStores(pool?: Pool): Promise<SharedStores> {
  const sessionTtlMs = env.auth.sessionTtlDays * 24 * 60 * 60 * 1000;
  const shared: SharedStores = {};
  if (env.redisUrl) {
    const redis = await createRedisClient(env.redisUrl);
    console.log('[dimol-api] 공유 상태: Redis (세션·OTP·레이트리밋)');
    shared.sessionStore = new RedisSessionStore(redis, sessionTtlMs);
    shared.rateLimitStore = new RedisRateLimitStore(redis);
    shared.otpKv = new RedisOtpKv(redis);
  } else if (env.upstash.restUrl && env.upstash.restToken) {
    const redis = createUpstashRedis(env.upstash.restUrl, env.upstash.restToken);
    console.log('[dimol-api] 공유 상태: Upstash Redis REST (세션·OTP·레이트리밋)');
    shared.sessionStore = new RedisSessionStore(redis, sessionTtlMs);
    shared.rateLimitStore = new RedisRateLimitStore(redis);
    shared.otpKv = new RedisOtpKv(redis);
  } else if (env.auth.sessionSecret) {
    console.log('[dimol-api] 세션: 무상태(서명) — Redis 없이 다중 인스턴스 동작');
    shared.sessionStore = new StatelessSessionStore(env.auth.sessionSecret, sessionTtlMs);
  }
  // OTP: Redis 미사용 + pg 풀 있으면 Postgres 로(인메모리 대신 재시작에도 유지).
  if (!shared.otpKv && pool) {
    await ensureOtpSchema(pool);
    shared.otpKv = new PgOtpKv(pool);
    console.log('[dimol-api] OTP: PostgreSQL');
  }
  return shared;
}

async function main(): Promise<void> {
  assertProductionConfig();
  // pg 풀은 한 번만 만들어 영속 저장소와 OTP 저장소가 공유한다.
  const pool = env.databaseUrl ? createPgPool(env.databaseUrl) : undefined;
  const persistence = await buildPersistence(pool);
  const shared = await buildSharedStores(pool);
  const app = createApp(persistence, shared);

  const server = app.listen(env.port, () => {
    // 서버 로그에는 PII/시크릿을 남기지 않는다 (CLAUDE.md 절대 규칙).
    console.log(`[dimol-api] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Attach WebSocket server
  const { setupTrackingWebSocket } = await import('./tracking/websocket.js');
  setupTrackingWebSocket(server);

  // 무중단 배포·컨테이너 종료 대응 — 진행 중 요청을 마치고 정리 후 종료.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      console.log(`[dimol-api] ${signal} 수신 — 서버를 정상 종료합니다.`);
      server.close(() => process.exit(0));
      // 정리가 지연되면 강제 종료(무한 대기 방지).
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
}

main().catch((err) => {
  console.error('[dimol-api] 기동 실패', err);
  process.exit(1);
});
