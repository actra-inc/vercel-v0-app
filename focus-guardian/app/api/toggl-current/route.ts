import { NextResponse } from "next/server"

export const runtime = "edge"

// ワークスペースごとにキャッシュする（単一の共有キャッシュだと
// 複数ユーザー利用時に他ユーザーのプロジェクト名が返ってしまう）
const projectsCacheMap = new Map<string, { data: Record<string, string>; timestamp: number }>()
const CACHE_DURATION = 1000 * 60 * 5 // 5 minutes

// Base64 encode function for Edge runtime
function base64Encode(str: string): string {
  return btoa(str)
}

async function getProjects(apiToken: string, workspaceId: string): Promise<Record<string, string>> {
  const now = Date.now()
  const cacheKey = `${workspaceId}:${apiToken.slice(0, 8)}`
  const cached = projectsCacheMap.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data
  }

  if (!apiToken || !workspaceId) {
    console.error("Toggl credentials are not provided.")
    return {}
  }

  const auth = base64Encode(`${apiToken}:api_token`)
  try {
    const res = await fetch(`https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/projects`, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      console.error(`Failed to fetch Toggl projects: ${res.status}`)
      return cached?.data || {}
    }

    const list = await res.json()
    const data: Record<string, string> = !Array.isArray(list)
      ? {}
      : list.reduce((m: Record<string, string>, p: any) => {
          m[p.id] = p.name
          return m
        }, {})

    projectsCacheMap.set(cacheKey, { data, timestamp: now })
    return data
  } catch (error) {
    console.error("Error fetching Toggl projects:", error)
    return cached?.data || {}
  }
}

export async function GET(request: Request) {
  try {
    // Get API token and workspace ID from query parameters or environment variables
    const { searchParams } = new URL(request.url)
    const apiToken = searchParams.get("apiToken") || process.env.TOGGL_API_TOKEN
    const workspaceId = searchParams.get("workspaceId") || process.env.TOGGL_WORKSPACE_ID

    if (!apiToken || !workspaceId) {
      return NextResponse.json(
        {
          error: "Toggl integration not configured.",
          debug: {
            hasApiToken: !!apiToken,
            hasWorkspaceId: !!workspaceId,
            envToken: !!process.env.TOGGL_API_TOKEN,
            envWorkspace: !!process.env.TOGGL_WORKSPACE_ID,
          },
        },
        { status: 500 },
      )
    }

    const auth = base64Encode(`${apiToken}:api_token`)

    // First, get current time entry
    const currentRes = await fetch("https://api.track.toggl.com/api/v9/me/time_entries/current", {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!currentRes.ok) {
      const errorText = await currentRes.text()
      console.error(`Toggl current entry API responded with status ${currentRes.status}:`, errorText)
      return NextResponse.json(
        {
          error: `Toggl API responded with status ${currentRes.status}`,
          debug: {
            status: currentRes.status,
            statusText: currentRes.statusText,
            response: errorText,
            apiToken: apiToken ? `${apiToken.substring(0, 8)}...` : null,
            workspaceId,
          },
        },
        { status: 500 },
      )
    }

    const currentData = await currentRes.json()
    console.log("Toggl current entry response:", JSON.stringify(currentData, null, 2))

    // If no current entry, try to get the most recent entry
    let entryData = null
    if (!currentData || !currentData.id) {
      // Get recent time entries
      const recentRes = await fetch(
        `https://api.track.toggl.com/api/v9/me/time_entries?start_date=${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}&end_date=${new Date().toISOString()}`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        },
      )

      if (recentRes.ok) {
        const recentEntries = await recentRes.json()
        console.log("Recent entries:", JSON.stringify(recentEntries, null, 2))

        if (Array.isArray(recentEntries) && recentEntries.length > 0) {
          // Get the most recent entry
          entryData = recentEntries.sort(
            (a: any, b: any) => new Date(b.start).getTime() - new Date(a.start).getTime(),
          )[0]
        }
      }
    } else {
      entryData = currentData
    }

    if (!entryData) {
      return NextResponse.json({
        project: null,
        description: null,
        start: null,
        debug: {
          message: "No current or recent time entries found",
          currentResponse: currentData,
          hasCurrentEntry: !!currentData?.id,
        },
      })
    }

    // Get project information
    const projects = await getProjects(apiToken, workspaceId)
    const projectName = entryData.project_id ? projects[entryData.project_id] : null

    // Prepare response data
    const responseData = {
      project: projectName,
      description: entryData.description || null,
      start: entryData.start || null,
      duration: entryData.duration || null,
      is_running: entryData.duration < 0,
      entry_id: entryData.id,
      project_id: entryData.project_id,
      workspace_id: entryData.workspace_id,
      elapsed_seconds:
        entryData.duration < 0
          ? Math.floor((Date.now() - new Date(entryData.start).getTime()) / 1000)
          : Math.abs(entryData.duration),
      debug: {
        rawEntry: entryData,
        availableProjects: projects,
        projectLookup: {
          project_id: entryData.project_id,
          found_project: projectName,
        },
        entryFields: {
          id: entryData.id,
          description: entryData.description,
          start: entryData.start,
          duration: entryData.duration,
          project_id: entryData.project_id,
          workspace_id: entryData.workspace_id,
          tags: entryData.tags,
        },
      },
    }

    console.log("Final response:", JSON.stringify(responseData, null, 2))
    return NextResponse.json(responseData)
  } catch (e: any) {
    console.error("Toggl API error:", e)
    return NextResponse.json(
      {
        error: "Toggl API error",
        debug: {
          errorMessage: e.message,
          errorStack: e.stack,
        },
      },
      { status: 500 },
    )
  }
}
