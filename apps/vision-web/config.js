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
  mock: true,

  // Supabase 연동값(공개 anon key). mock=false 일 때 사용. 미설정 시 목로 폴백.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // 로컬/직접 연동: FastAPI 잡 서버(apps/vision-api)를 직접 호출(개발·데모용).
  // 설정 시 Supabase 대신 REST 경로 사용. 프로덕션은 Edge Function 경유(§3.1) 권장.
  restBaseUrl: "",   // 예: "http://localhost:8080/v1"
  restApiKey: "",    // 예: "dev-edge-key" (VISION_API_KEY)
  // 사진을 서버에 업로드할 수 없는 로컬 데모에서는 photo_urls 대신 개수만 전달.

  maxPhotos: 10,
  // 사진 1장 최대 크기(10MB) — packages/shared SITE_PHOTO_MAX_BYTES 미러.
  maxBytesPerPhoto: 10 * 1024 * 1024,
};
