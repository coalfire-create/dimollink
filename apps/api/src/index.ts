import { createApp, type SharedStores } from './app.js';
import { RedisOtpKv } from './auth/redis-otp-kv.js';
import { RedisSessionStore } from './auth/redis-session-store.js';
import { env } from './config/env.js';
import { jsonPersistenceFactory, type PersistenceFactory } from './lib/json-collection.js';
import { createPgPool, initPgPersistence } from './lib/pg-collection.js';
import { createRedisClient } from './lib/redis.js';
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

/** 저장소 선택 — DATABASE_URL 이 있으면 PostgreSQL, 없으면 JSON 파일 폴백. */
async function buildPersistence(): Promise<PersistenceFactory> {
  if (env.databaseUrl) {
    const factory = await initPgPersistence(createPgPool(env.databaseUrl));
    console.log('[dimol-api] 저장소: PostgreSQL');
    return factory;
  }
  console.log('[dimol-api] 저장소: JSON 파일(.data) — 운영에서는 DATABASE_URL 권장');
  return jsonPersistenceFactory(env.dataDir);
}

/** Redis 설정 시 다중 인스턴스 공유 상태(세션·레이트리밋)를 구성. */
async function buildSharedStores(): Promise<SharedStores> {
  if (!env.redisUrl) return {};
  const redis = await createRedisClient(env.redisUrl);
  console.log('[dimol-api] 공유 상태: Redis (세션·OTP·레이트리밋)');
  return {
    sessionStore: new RedisSessionStore(redis, env.auth.sessionTtlDays * 24 * 60 * 60 * 1000),
    rateLimitStore: new RedisRateLimitStore(redis),
    otpKv: new RedisOtpKv(redis),
  };
}

async function main(): Promise<void> {
  assertProductionConfig();
  const persistence = await buildPersistence();
  const shared = await buildSharedStores();
  const app = createApp(persistence, shared);

  const server = app.listen(env.port, () => {
    // 서버 로그에는 PII/시크릿을 남기지 않는다 (CLAUDE.md 절대 규칙).
    console.log(`[dimol-api] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

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
