import { createApp } from './app.js';
import { env } from './config/env.js';

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

assertProductionConfig();

const app = createApp();

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
