// create-analysis — 분석 잡 생성 트리거 (기획서 §3.2 ①②).
// ① analyses 행 생성(RLS: 본인) + analysis_images 기록
// ② 사진 서명 다운로드 URL 을 만들어 vision-api POST /v1/jobs 호출(콜백 URL 포함)
// 프론트는 AI 서버를 직접 호출하지 않는다(§3.1). AI 서버 키는 이 함수(서버)만 안다.
import { getAuthedContext } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { CONFIG } from "../_shared/env.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  try {
    const { supabase, userId } = await getAuthedContext(req);
    const body = await req.json();
    const photoPaths: string[] = body.photo_paths ?? [];
    const inputMeta = body.input_meta ?? {};

    if (photoPaths.length < 1 || photoPaths.length > CONFIG.maxPhotos()) {
      return jsonResponse({ error: `사진은 1~${CONFIG.maxPhotos()}장` }, 422);
    }
    // 업로드 경로가 본인 폴더인지 확인(<user_id>/...).
    if (!photoPaths.every((p) => p.startsWith(`${userId}/`))) {
      return jsonResponse({ error: "본인 소유 사진 경로만 허용됩니다." }, 403);
    }

    // ① analyses insert (RLS 로 user_id 강제) + 이미지 기록
    const { data: analysis, error: insErr } = await supabase
      .from("analyses")
      .insert({ user_id: userId, status: "queued", input_meta: inputMeta })
      .select("id")
      .single();
    if (insErr) return jsonResponse({ error: insErr.message }, 500);
    const analysisId = analysis.id;

    const { error: imgErr } = await supabase.from("analysis_images").insert(
      photoPaths.map((p) => ({ analysis_id: analysisId, storage_path: p })),
    );
    if (imgErr) return jsonResponse({ error: imgErr.message }, 500);

    // ② 서명 다운로드 URL (AI 서버가 사진을 가져갈 수 있도록)
    const bucket = CONFIG.photoBucket();
    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrls(photoPaths, CONFIG.signedUrlTtl());
    if (signErr) return jsonResponse({ error: signErr.message }, 500);
    const photoUrls = (signed ?? []).map((s) => s.signedUrl);

    // 콜백 URL 에 analysis_id 를 실어 vision-api 결과를 이 행으로 매핑한다.
    const callbackUrl =
      `${CONFIG.supabaseUrl()}/functions/v1/analysis-callback?analysis_id=${analysisId}`;

    // vision-api 트리거. 실패해도 잡은 queued 로 남아 재처리·폴링 가능(폴백 철학, §3.2).
    const resp = await fetch(`${CONFIG.visionApiUrl()}/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": CONFIG.visionApiKey() },
      body: JSON.stringify({
        photo_urls: photoUrls,
        input_meta: inputMeta,
        callback_url: callbackUrl,
      }),
    });
    if (!resp.ok) {
      await supabase
        .from("analyses")
        .update({ status: "failed", error: `AI 서버 트리거 실패(${resp.status})` })
        .eq("id", analysisId);
      return jsonResponse({ analysis_id: analysisId, warning: "AI 서버 트리거 실패, 재시도 필요" }, 502);
    }

    return jsonResponse({ analysis_id: analysisId });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonResponse({ error: String(e) }, 500);
  }
});
