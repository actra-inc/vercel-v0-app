import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// ログイン失敗の理由をトップページへ伝える
// （従来は無言で / に戻していたため、ログインできない原因が誰にも分からなかった）
function failRedirect(origin: string, reason: string, detail?: string) {
  const url = new URL("/", origin)
  url.searchParams.set("auth_error", reason)
  if (detail) url.searchParams.set("auth_detail", detail.slice(0, 200))
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  if (error) {
    console.error("OAuth error:", error, errorDescription)
    return failRedirect(origin, error, errorDescription || undefined)
  }

  if (code) {
    // レスポンスを先に作成し、クッキーをそのレスポンスに直接セットする
    // （cookies() から取得した cookieStore に set しても NextResponse.redirect の
    //   レスポンスには反映されないため、この順序が重要）
    const response = NextResponse.redirect(origin)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            )
          },
        },
      },
    )

    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError && data?.session) {
      return response
    }

    // 典型的な失敗: PKCEのcode_verifierクッキーが読めない／期限切れ／コード再利用
    console.error("Code exchange error:", exchangeError)
    return failRedirect(origin, "exchange_failed", exchangeError?.message || "session was not created")
  }

  // codeが無い = Supabaseがこのコールバックへ戻していない
  // （Supabaseの Redirect URLs 許可リストにこのドメインが無い場合に起きる）
  return failRedirect(origin, "no_code", "callback was reached without an authorization code")
}
