// 本番環境用設定

// 画面キャプチャ間隔の既定値（秒）。
// 新規ユーザー作成時（use-supabase-data）と設定未取得時のフォールバック（page.tsx）の
// 両方から参照する。以前は 180 と 60 で食い違っていた
export const DEFAULT_CAPTURE_INTERVAL_SECONDS = 60

export const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  auth: {
    url: process.env.NEXTAUTH_URL || "http://localhost:3000",
    secret: process.env.NEXTAUTH_SECRET,
  },
  apis: {
    gemini: process.env.GEMINI_API_KEY,
    toggl: {
      token: process.env.TOGGL_API_TOKEN,
      workspaceId: process.env.TOGGL_WORKSPACE_ID,
    },
  },
  app: {
    isDevelopment: process.env.NODE_ENV === "development",
    isProduction: process.env.NODE_ENV === "production",
  },
}

// 環境変数チェック
export function validateConfig() {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXTAUTH_SECRET"]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
  }
}
