// 환경변수 접근 (기획서 §7.2 — 키는 .env / Supabase 시크릿으로만).
// service_role 키는 콜백(analysis-callback)에서만 쓰고 브라우저에 노출하지 않는다.
export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`필수 환경변수 누락: ${name}`);
  return v;
}

export const CONFIG = {
  supabaseUrl: () => requireEnv("SUPABASE_URL"),
  anonKey: () => requireEnv("SUPABASE_ANON_KEY"),
  serviceRoleKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  // 현장 사진 비공개 버킷.
  photoBucket: () => Deno.env.get("VISION_PHOTO_BUCKET") ?? "vision-site-photos",
  // AI 서버(vision-api).
  visionApiUrl: () => requireEnv("VISION_API_URL"),
  visionApiKey: () => requireEnv("VISION_API_KEY"),
  // 콜백 검증 시크릿(vision-api 와 공유).
  callbackSecret: () => Deno.env.get("VISION_CALLBACK_SECRET") ?? "",
  // 서명 다운로드 URL 유효시간(초) — AI 서버가 사진을 가져갈 시간.
  signedUrlTtl: () => Number(Deno.env.get("VISION_SIGNED_URL_TTL") ?? "600"),
  maxPhotos: () => Number(Deno.env.get("VISION_MAX_PHOTOS") ?? "40"),
};
