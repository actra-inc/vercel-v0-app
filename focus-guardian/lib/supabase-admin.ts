import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// service role クライアント（RLSをバイパスする）。
// 週次レポートのcronのように「ユーザーセッションが無いバッチ」専用。
// "server-only" のimportにより、クライアントコンポーネントから誤って
// importするとビルドが失敗する（キーのバンドル混入を構造的に防ぐ）
let adminClient: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    // キーの値は絶対にメッセージへ含めない
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured")
  }
  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return adminClient
}
