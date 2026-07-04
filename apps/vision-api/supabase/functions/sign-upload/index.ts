// sign-upload — 현장 사진 업로드용 서명 URL 발급 (기획서 §3.2 ①).
// 클라이언트는 이 URL 로 Storage(비공개 버킷)에 직접 업로드한 뒤, 받은 path 로 create-analysis 를 호출한다.
// 오브젝트 키에는 PII 를 넣지 않는다: <user_id>/<uuid>.<ext> 만 사용.
import { getAuthedContext } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { CONFIG } from "../_shared/env.ts";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  try {
    const { supabase, userId } = await getAuthedContext(req);
    const body = await req.json();
    const files: Array<{ content_type: string }> = body.files ?? [];

    if (files.length < 1 || files.length > CONFIG.maxPhotos()) {
      return jsonResponse({ error: `사진은 1~${CONFIG.maxPhotos()}장` }, 422);
    }

    const bucket = CONFIG.photoBucket();
    const results = [];
    for (const f of files) {
      const ext = EXT[f.content_type];
      if (!ext) return jsonResponse({ error: `허용되지 않은 형식: ${f.content_type}` }, 422);
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(path);
      if (error) return jsonResponse({ error: error.message }, 500);
      results.push({ path, signed_url: data.signedUrl, token: data.token });
    }

    return jsonResponse({ bucket, uploads: results });
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonResponse({ error: String(e) }, 500);
  }
});
