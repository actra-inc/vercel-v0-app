import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // セッションを更新（トークンリフレッシュを処理）
  await supabase.auth.getUser()

  // Permissions-Policy: display-capture を self に限定して許可
  response.headers.set("Permissions-Policy", "display-capture=(self)")

  // 古いブラウザ対応のため Feature-Policy も設定
  response.headers.set("Feature-Policy", "display-capture 'self'")

  // HTTPS必須のため、開発環境でもSecure Contextを確保
  if (process.env.NODE_ENV === "development") {
    response.headers.set("Cross-Origin-Embedder-Policy", "unsafe-none")
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin")
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
