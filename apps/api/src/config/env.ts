import 'dotenv/config';

/** 환경변수 로딩 헬퍼. 민감정보는 .env 에서만 읽는다 (코드 하드코딩 금지). */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`필수 환경변수 누락: ${name} (apps/api/.env 를 확인하세요)`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  // 실제 연동 시 아래를 required(...) 로 강제. 스캐폴딩 단계에서는 optional.
  databaseUrl: process.env.DATABASE_URL,
  allbaro: {
    baseUrl: process.env.ALLBARO_API_BASE_URL,
    apiKey: process.env.ALLBARO_API_KEY,
    // 기본은 sandbox. 운영 전환은 CLAUDE.md 규칙상 샌드박스 검증 완료 후에만 한다.
    mode: (process.env.ALLBARO_ENV ?? 'sandbox') as 'sandbox' | 'production',
    // 운영 호출을 명시적으로 허용하지 않으면 클라이언트가 production 호출을 거부한다.
    allowProduction: process.env.ALLBARO_ALLOW_PRODUCTION === 'true',
    // 외부(정부) API 응답 지연 대비 요청 타임아웃(ms).
    timeoutMs: Number(process.env.ALLBARO_TIMEOUT_MS ?? 10_000),
  },
  portone: {
    baseUrl: process.env.PORTONE_API_BASE_URL ?? 'https://api.portone.io',
    apiSecret: process.env.PORTONE_API_SECRET,
    storeId: process.env.PORTONE_STORE_ID,
    // 기본은 test. 운영(live) 전환은 CLAUDE.md 규칙상 테스트 모드 검증 완료 후에만 한다.
    mode: (process.env.PORTONE_ENV ?? 'test') as 'test' | 'live',
    // live 호출을 명시적으로 허용하지 않으면 클라이언트가 실거래 호출을 거부한다.
    allowLive: process.env.PORTONE_ALLOW_LIVE === 'true',
    timeoutMs: Number(process.env.PORTONE_TIMEOUT_MS ?? 10_000),
  },
};

export { required };
