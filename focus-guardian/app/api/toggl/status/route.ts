import { NextResponse } from "next/server"

export const runtime = "edge"

export async function GET() {
  const configured = !!(process.env.TOGGL_API_TOKEN && process.env.TOGGL_WORKSPACE_ID)

  // Return a more detailed response for debugging
  return NextResponse.json({
    configured,
    hasToken: !!process.env.TOGGL_API_TOKEN,
    hasWorkspaceId: !!process.env.TOGGL_WORKSPACE_ID,
  })
}
