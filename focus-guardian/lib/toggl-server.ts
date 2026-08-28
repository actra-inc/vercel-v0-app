import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Toggl連携APIルートの共通処理（認証・環境変数の所有者判定・入力検証）。
// クライアント用の lib/supabase.ts とは別ファイルにする（あちらは createBrowserClient）

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

export const hasTogglEnvCredentials = (): boolean =>
  Boolean(process.env.TOGGL_API_TOKEN && process.env.TOGGL_WORKSPACE_ID)

/**
 * 環境変数のTogglトークン（オーナーの個人運用モード）を使ってよいユーザーかを判定する。
 *
 * 以前は「自分の資格情報を保存していないログインユーザー全員」が環境変数へ
 * フォールバックしており、同じデプロイを共有する別のユーザーにオーナーの
 * Toggl作業記録が見えてしまう状態だった。
 * TOGGL_OWNER_USER_ID / TOGGL_OWNER_EMAIL で本人を明示した場合だけ許可し、
 * 未設定ならフォールバックしない（多人数運用で安全側に倒す）。
 */
export function isTogglEnvOwner(user: { id?: string; email?: string | null } | null | undefined): boolean {
  if (!user) return false
  const ownerId = process.env.TOGGL_OWNER_USER_ID?.trim()
  const ownerEmail = process.env.TOGGL_OWNER_EMAIL?.trim().toLowerCase()
  if (!ownerId && !ownerEmail) return false
  if (ownerId && user.id === ownerId) return true
  if (ownerEmail && (user.email ?? "").toLowerCase() === ownerEmail) return true
  return false
}

// Toggl の workspace ID は数値、APIトークンは英数字。
// 未検証のままURLに埋めると `../` でTogglの別エンドポイントへ向けられるほか、
// 想定外の文字だとBasic認証ヘッダー生成(btoa)が例外になる
export const isValidWorkspaceId = (value: unknown): value is string =>
  typeof value === "string" && /^\d{1,20}$/.test(value)

export const isValidApiToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._~-]{8,256}$/.test(value)
