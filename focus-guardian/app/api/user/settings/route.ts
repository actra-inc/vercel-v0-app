import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

// In a real app, you'd use a database. For demo, we'll use a simple in-memory store
const userSettings = new Map()

async function getUser(request: NextRequest) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get("session")

  if (!sessionCookie) {
    return null
  }

  try {
    const session = JSON.parse(decodeURIComponent(sessionCookie.value))
    return session.user
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const user = await getUser(request)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const settings = userSettings.get(user.id) || {}
  return NextResponse.json(settings)
}

export async function POST(request: NextRequest) {
  const user = await getUser(request)

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const newSettings = await request.json()
  const existingSettings = userSettings.get(user.id) || {}

  const updatedSettings = { ...existingSettings, ...newSettings }
  userSettings.set(user.id, updatedSettings)

  return NextResponse.json({ success: true })
}
