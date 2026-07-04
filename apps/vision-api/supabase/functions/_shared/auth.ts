// 사용자 인증 컨텍스트 헬퍼.
// 브라우저가 보낸 JWT(Authorization: Bearer) 로 supabase 클라이언트를 만들면
// 이후 DB 접근에 RLS 가 그대로 적용된다(사용자는 본인 데이터만).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CONFIG } from "./env.ts";

export interface AuthedContext {
  supabase: SupabaseClient;
  userId: string;
}

export async function getAuthedContext(req: Request): Promise<AuthedContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Response("인증 필요", { status: 401 });

  const supabase = createClient(CONFIG.supabaseUrl(), CONFIG.anonKey(), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Response("유효하지 않은 세션", { status: 401 });

  return { supabase, userId: data.user.id };
}
