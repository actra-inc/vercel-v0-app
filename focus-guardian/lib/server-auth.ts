import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// APIルート用: cookieのセッションからログインユーザーを解決する。
// （lib/toggl-server.ts にも同型の関数があるが、Toggl固有ファイルへの依存を
//   避けるため汎用版としてここに置く）
export async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Componentからの書き込みエラーは無視
          }
        },
      },
    },
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { user, supabase }
}
