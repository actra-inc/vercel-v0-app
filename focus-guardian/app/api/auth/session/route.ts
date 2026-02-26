import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("session")

    if (!sessionCookie) {
      return NextResponse.json({ user: null })
    }

    // In a real app, you'd verify the session token here
    // For demo purposes, we'll decode a simple JSON token
    try {
      const session = JSON.parse(decodeURIComponent(sessionCookie.value))
      return NextResponse.json({ user: session.user })
    } catch {
      return NextResponse.json({ user: null })
    }
  } catch (error) {
    return NextResponse.json({ user: null })
  }
}
