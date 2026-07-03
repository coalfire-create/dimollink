import 'dotenv/config';

/** 환경변수 로딩 헬퍼. 민감정보는 .env 에서만 읽는다 (코드 하드코딩 금지). */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`필수 환경변수 누락: ${name} (apps/api/.env 를 확인하세요)`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 4000),
  /** CORS 허용 출처(콤마 구분). 미설정 시 개발 편의로 전체 허용, 운영에선 반드시 지정. */
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  auth: {
    // 세션 토큰 유효기간(일). 기본 30일.
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  },
  otp: {
    // 코드 유효시간(초, 기본 180) · 재발송 쿨다운(초, 기본 30) · 최대 검증 시도(기본 5).
    ttlSec: Number(process.env.OTP_TTL_SEC ?? 180),
    resendCooldownSec: Number(process.env.OTP_RESEND_COOLDOWN_SEC ?? 30),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
    /**
     * 개발/테스트용 마스터 인증코드. 운영(production)에서는 절대 사용하지 않는다.
     * 비운영 환경에서만 값을 노출하며, 기본값도 운영에서는 undefined.
     */
    devMasterCode: process.env.OTP_DEV_MASTER_CODE ?? '123456',
  },
  // PostgreSQL 접속 문자열. 설정 시 JSON 파일 대신 DB 영속화를 사용한다.
  databaseUrl: process.env.DATABASE_URL,
  // Redis 접속 문자열. 설정 시 세션·레이트리밋을 인스턴스 간 공유(다중 인스턴스).
  redisUrl: process.env.REDIS_URL,
  // 파일럿 단계 요청 데이터 JSON 저장 경로 (DATABASE_URL 미설정 시 폴백).
  dataDir: process.env.DATA_DIR ?? '.data',
  sms: {
    // 실 SMS 발송 REST API. 미설정 시 콘솔 발송(개발)로 폴백.
    apiUrl: process.env.SMS_API_URL,
    apiKey: process.env.SMS_API_KEY,
    sender: process.env.SMS_SENDER, // 발신번호(사전 등록 필요).
    timeoutMs: Number(process.env.SMS_TIMEOUT_MS ?? 5000),
  },
  geocode: {
    // 주소 → 좌표 변환. 현재 카카오 로컬 API 지원. 미설정 시 좌표 없이 진행.
    provider: (process.env.GEOCODE_PROVIDER ?? 'none') as 'kakao' | 'none',
    kakaoRestKey: process.env.KAKAO_REST_API_KEY,
    timeoutMs: Number(process.env.GEOCODE_TIMEOUT_MS ?? 5000),
  },
  // 관리자 백오피스 API 토큰 (Phase 5). 미설정 시 /api/admin/* 전체가 503 으로 잠긴다.
  adminToken: process.env.ADMIN_TOKEN,
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
  storage: {
    // 현장 사진 스토리지 — AWS S3 또는 S3 호환 서비스(NCP Object Storage, MinIO 등).
    // endpoint 미설정 시 AWS S3 기본 엔드포인트를 사용한다.
    region: process.env.STORAGE_REGION ?? 'ap-northeast-2',
    bucket: process.env.STORAGE_BUCKET,
    endpoint: process.env.STORAGE_ENDPOINT,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    // MinIO 등 path-style 만 지원하는 호환 스토리지용.
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
    // presigned URL 유효시간(초). 업로드는 짧게, 조회는 화면 표시 시간을 고려해 설정.
    uploadUrlTtlSec: Number(process.env.STORAGE_UPLOAD_URL_TTL_SEC ?? 300),
    viewUrlTtlSec: Number(process.env.STORAGE_VIEW_URL_TTL_SEC ?? 600),
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
