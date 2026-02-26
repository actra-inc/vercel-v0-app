import { type NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

export async function GET(request: NextRequest) {
  /**
   * In production you would run the full Google OAuth flow.
   * For this demo a signed-in session is mocked and the user
   * is redirected back to the homepage.
   */
  const mockUser = {
    id: "demo-user-123",
    name: "Demo User",
    email: "demo@example.com",
    image: "https://via.placeholder.com/40",
  }

  const session = {
    user: mockUser,
    // 30 days
    expires: Date.now() + 1000 * 60 * 60 * 24 * 30,
  }

  // Build an explicit redirect response so we can
  // mutate the Set-Cookie header before returning.
  const response = NextResponse.redirect(new URL("/", request.url))

  response.cookies.set({
    name: "session",
    value: encodeURIComponent(JSON.stringify(session)),
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  })

  return response
}
