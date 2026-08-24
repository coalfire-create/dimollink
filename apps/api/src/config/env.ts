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
    // 무상태(서명) 세션용 시크릿. 설정 시 Redis 없이도 서버리스에서 세션이 동작한다.
    sessionSecret: process.env.SESSION_SECRET,
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
  /**
   * 테스트/스테이징 전용 스위치. 운영에는 절대 켜지 않는다.
   * - allowTestOtp: 운영 모드(NODE_ENV=production)에서도 마스터 OTP 코드를 허용(테스트 배포용).
   * - seedTestAccounts: 기동 시 역할별 테스트 계정을 없으면 생성한다.
   */
  allowTestOtp: process.env.ALLOW_TEST_OTP === 'true',
  seedTestAccounts: process.env.SEED_TEST_ACCOUNTS === 'true',
  /**
   * 기능 플래그. 파일럿(양평/철거) 범위 밖 기능은 기본 off 로 두고 명시적으로 켠다.
   * - interior: 소비자↔인테리어 업체 밀봉 역경매. 로드맵 Phase 편입 전까지 off 기본.
   */
  features: {
    interior: process.env.FEATURE_INTERIOR === 'true',
  },
  // PostgreSQL 접속 문자열. 설정 시 JSON 파일 대신 DB 영속화를 사용한다.
  databaseUrl: process.env.DATABASE_URL,
  // Redis 접속 문자열(TCP). 설정 시 세션·레이트리밋을 인스턴스 간 공유(다중 인스턴스).
  redisUrl: process.env.REDIS_URL,
  // Upstash Redis(REST) — Vercel 등 서버리스에서 TCP 대신 사용. 마켓플레이스가 자동 주입.
  upstash: {
    restUrl: process.env.UPSTASH_REDIS_REST_URL,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  },
  // 파일럿 단계 요청 데이터 JSON 저장 경로 (DATABASE_URL 미설정 시 폴백).
  dataDir: process.env.DATA_DIR ?? '.data',
  sms: {
    // 발송 공급자 선택: auto(기본, 설정된 것 자동) | solapi | http | console.
    provider: (process.env.SMS_PROVIDER ?? 'auto') as 'auto' | 'solapi' | 'http' | 'console',
    // 발신번호 — Solapi/범용 REST 공통. 공급자 콘솔에 사전 등록·인증한 번호여야 한다.
    sender: process.env.SMS_SENDER,
    timeoutMs: Number(process.env.SMS_TIMEOUT_MS ?? 5000),
    // Solapi(구 CoolSMS) — HMAC-SHA256 서명 인증. 권장 공급자.
    solapi: {
      apiKey: process.env.SOLAPI_API_KEY,
      apiSecret: process.env.SOLAPI_API_SECRET,
    },
    // 범용 REST 발송 API(Bearer 인증). 미설정 시 콘솔 발송(개발)로 폴백.
    apiUrl: process.env.SMS_API_URL,
    apiKey: process.env.SMS_API_KEY,
  },
  geocode: {
    // 주소 → 좌표 변환. 현재 카카오 로컬 API 지원. 키가 있으면 자동으로 kakao 사용.
    provider: (process.env.GEOCODE_PROVIDER ??
      (process.env.KAKAO_REST_API_KEY ? 'kakao' : 'none')) as 'kakao' | 'none',
    kakaoRestKey: process.env.KAKAO_REST_API_KEY,
    timeoutMs: Number(process.env.GEOCODE_TIMEOUT_MS ?? 5000),
  },
  oauth: {
    // 콜백 베이스 URL(공개 API 주소). 공급자 콘솔에 등록한 redirect_uri 와 일치해야 한다.
    // 예: https://api.디몰링크.com → 콜백은 {base}/api/auth/oauth/{provider}/callback
    redirectBase: process.env.OAUTH_REDIRECT_BASE ?? '',
    // 콜백 후 앱으로 복귀할 딥링크(예: dimollink://auth). 미설정 시 콜백이 JSON 을 반환(웹/테스트).
    appRedirect: process.env.OAUTH_APP_REDIRECT ?? '',
    // state·가입 티켓 서명 시크릿. 미설정 시 세션 시크릿을 재사용(둘 다 없으면 소셜 로그인 비활성).
    secret: process.env.OAUTH_STATE_SECRET ?? process.env.SESSION_SECRET ?? '',
    // 카카오: client_id 는 앱의 REST API 키. client_secret 은 콘솔에서 활성화 후 사용(권장).
    kakao: {
      clientId: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    naver: {
      clientId: process.env.NAVER_CLIENT_ID,
      clientSecret: process.env.NAVER_CLIENT_SECRET,
    },
  },
  // 관리자 백오피스 API 토큰 (Phase 5). 미설정 시 /api/admin/* 전체가 503 으로 잠긴다.
  adminToken: process.env.ADMIN_TOKEN,
  allbaro: {
    // 올바로 Open API 개발 가이드 v1.9.1 기준
    // End Point: https://api.allbaro.or.kr:27000/restApi
    baseUrl: process.env.ALLBARO_API_BASE_URL,
    // 업체 발급 인증키 (api_cert_key, 24자리)
    apiCertKey: process.env.ALLBARO_API_CERT_KEY,
    // 업체코드 (entn_lkcd, 테스트: 9자리 업체번호)
    companyCode: process.env.ALLBARO_COMPANY_CODE,
    // Basic auth 아이디 (테스트: 업체번호)
    userId: process.env.ALLBARO_USER_ID,
    // Basic auth 비밀번호 (테스트: allbarosys)
    password: process.env.ALLBARO_PASSWORD,
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
  ai: {
    // 현장 사진 비전 분석. 공급자 우선순위: Groq > Gemini > Claude > 목(mock).
    // 미설정 시 목 분석으로 폴백(키·비용 없이 동작).
    // Groq — 무료 티어(카드 불필요). 비전은 qwen3 계열. https://console.groq.com
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL ?? 'qwen/qwen3.6-27b',
    // Google Gemini — 무료 티어(계정에 따라). https://aistudio.google.com/apikey
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    // Anthropic Claude(유료).
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
    // 비전 API 공통 요청 타임아웃(ms).
    visionTimeoutMs: Number(
      process.env.VISION_TIMEOUT_MS ?? process.env.ANTHROPIC_TIMEOUT_MS ?? 30_000,
    ),
    anthropicTimeoutMs: Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 30_000),
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
    // 웹훅 서명 검증 시크릿(포트원 콘솔 발급). 가상계좌 입금 완료(Transaction.Paid) 수신 검증에 사용.
    webhookSecret: process.env.PORTONE_WEBHOOK_SECRET,
  },
};

export { required };
