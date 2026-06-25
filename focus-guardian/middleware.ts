import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  response.headers.set("Permissions-Policy", "display-capture=(self)")
  response.headers.set("Feature-Policy", "display-capture 'self'")

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
