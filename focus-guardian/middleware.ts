import { NextResponse, type NextRequest } from "next/server"

const ALLOWED_ORIGINS = [
  "https://local.flownudge.actra.co.jp",
  "https://flownudge.actra.co.jp",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // OPTIONS プリフライトリクエストを処理
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") ?? ""
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin
    }
    return new NextResponse(null, { status: 204, headers })
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // API ルートには許可オリジンのみ CORS を付与（未登録オリジンはブラウザがブロック）
  if (pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") ?? ""
    if (ALLOWED_ORIGINS.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin)
    }
  }

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
