/*
 * 런타임 설정. 정적 호스팅(Vercel 등)에서 이 파일만 바꿔 환경을 전환한다.
 *
 * ⚠️ 프론트엔드는 AI 서버를 직접 호출하지 않는다(기획서 §3.1). 모든 요청은
 * Supabase Edge Function 을 경유한다. 여기 두는 값은 공개 가능한 것(anon key 등)만이며,
 * AI 서버 API 키·service_role 키는 절대 프론트에 두지 않는다.
 */
window.DimolVision = window.DimolVision || {};
window.DimolVision.config = {
  // true 면 백엔드 없이 목(mock) 흐름으로 동작(로컬 데모·UI 확인용).
  // 배포본은 false — 아래 restBaseUrl 의 디몰비전 AI 서버가 실제로 분석한다.
  mock: false,

  // Supabase 연동값(공개 anon key). mock=false 일 때 사용. 미설정 시 목로 폴백.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // 로컬/직접 연동: FastAPI 잡 서버(apps/vision-api)를 직접 호출(개발·데모용).
  // 설정 시 Supabase 대신 REST 경로 사용. 프로덕션은 Edge Function 경유(§3.1) 권장.
  restBaseUrl: "https://dimolvision-ai-production.up.railway.app/v1",
  restApiKey: "dimolvision-demo",    // VISION_API_KEY (데모 전용, 일일 상한 적용)

  // 건축물대장(공공데이터) 조회는 디몰링크 본체가 담당한다 — 공공데이터 키가 거기 있고,
  // 키를 두 곳에 두지 않기 위해서다. 여기서는 조회 결과(사실 문구)만 받아 분석에 넘긴다.
  dimollinkApiUrl: "https://demolink-api-production.up.railway.app/api",
  demoKey: "",   // 본체의 VISION_DEMO_KEY. 비어 있으면 대장 조회를 건너뛴다.

  // 철거 분석은 사진이 많을수록 정확하다(촬영 프로토콜: 현장당 20~40장). 내부 위주로 많이 유도.
  // ⚠️ 백엔드와 일치해야 함: supabase/functions/_shared/env.ts, apps/vision-api/app/config.py (VISION_MAX_PHOTOS 기본 40).
  maxPhotos: 40,
  // 사진 1장 최대 크기(10MB) — packages/shared SITE_PHOTO_MAX_BYTES 미러.
  maxBytesPerPhoto: 10 * 1024 * 1024,
};
