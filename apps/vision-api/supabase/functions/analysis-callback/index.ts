// analysis-callback — vision-api 진행/결과 콜백 수신 (기획서 §3.2 ③④).
// vision-api 가 잡 상태(JobResponse)를 이 URL 로 POST 한다. service_role 로 analyses 를 갱신하고,
// 클라이언트는 analyses 행 Realtime 구독으로 즉시 반영받는다(별도 브로드캐스트 불필요).
// 이 함수는 서버-서버 호출이며 X-Callback-Secret 로 검증한다(브라우저 호출 아님).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CONFIG } from "../_shared/env.ts";

// 상수시간 비교(타이밍 공격 완화).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const secret = CONFIG.callbackSecret();
  const provided = req.headers.get("X-Callback-Secret") ?? "";
  if (!secret || !safeEqual(provided, secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const analysisId = url.searchParams.get("analysis_id");
  if (!analysisId) return new Response("analysis_id 누락", { status: 400 });

  const job = await req.json(); // vision-api JobResponse

  // service_role 로 RLS 우회 갱신.
  const admin = createClient(CONFIG.supabaseUrl(), CONFIG.serviceRoleKey());
  const { error } = await admin
    .from("analyses")
    .update({
      status: job.status,
      stage: job.stage ?? null,
      result: job.result ?? null,
      model_version: job.model_version ?? null,
      error: job.error ?? null,
    })
    .eq("id", analysisId);

  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
