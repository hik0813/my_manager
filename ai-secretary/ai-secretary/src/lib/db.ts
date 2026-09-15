import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv, requireUrlEnv } from "./env";

let client: SupabaseClient | null = null;

/**
 * service_role 클라이언트. 서버 라우트에서만 쓴다.
 * RLS를 우회하므로 이 모듈이 클라이언트 번들에 들어가면 안 된다.
 */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(
      requireUrlEnv(
        "SUPABASE_URL",
        'Supabase → Project Settings → API의 "Project URL"을 넣으세요. https://<프로젝트ID>.supabase.co 형태입니다 (postgresql:// 로 시작하는 연결 문자열이 아닙니다).',
      ),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return client;
}

/** supabase 에러를 그대로 던져서 라우트의 try/catch가 잡게 한다. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
