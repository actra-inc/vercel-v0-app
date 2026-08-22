import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// 認証チェックに @supabase/ssr + cookies() を使うため Node.js ランタイムで実行する
// （以前は edge だったが、無認証で誰でも叩けるうえ環境変数のTogglトークンに
//   フォールバックするため、オーナーの作業記録が第三者へ漏れる穴になっていた）

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

async function getAuthenticatedUser() {
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

// トークンをクライアントから受け取らず、ログイン中ユーザーの user_settings から
// サーバー側で解決する。以前はGETクエリでトークンを送っており、Vercelの
// アクセスログに全権トークンが平文で残り続けていた
async function resolveCredentials(supabase: ReturnType<typeof createServerClient>, userId: string) {
  const { data } = await supabase
    .from("user_settings")
    .select("toggl_api_token, toggl_workspace_id")
    .eq("user_id", userId)
    .maybeSingle()
  const apiToken = data?.toggl_api_token || process.env.TOGGL_API_TOKEN
  const workspaceId = data?.toggl_workspace_id || process.env.TOGGL_WORKSPACE_ID
  return { apiToken, workspaceId }
}

// 現在のTogglエントリを取得（GET: 保存済み資格情報を使用）
export async function GET() {
  const { user, supabase } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: ログインが必要です" }, { status: 401 })
  }
  const { apiToken, workspaceId } = await resolveCredentials(supabase, user.id)
  return fetchTogglEntry(apiToken, workspaceId)
}

// 接続テスト用（POST: 保存前の資格情報をボディで受け取って検証する。
// ボディはURLと違いアクセスログに残らない）
export async function POST(request: Request) {
  const { user, supabase } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: ログインが必要です" }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  let apiToken: string | undefined = typeof body.apiToken === "string" ? body.apiToken : undefined
  let workspaceId: string | undefined = typeof body.workspaceId === "string" ? body.workspaceId : undefined
  if (!apiToken || !workspaceId) {
    const resolved = await resolveCredentials(supabase, user.id)
    apiToken = apiToken || resolved.apiToken
    workspaceId = workspaceId || resolved.workspaceId
  }
  return fetchTogglEntry(apiToken, workspaceId)
}

async function fetchTogglEntry(apiToken: string | undefined, workspaceId: string | undefined) {
  try {
    if (!apiToken || !workspaceId) {
      return NextResponse.json(
        {
          error: "Toggl integration not configured.",
          debug: { hasApiToken: !!apiToken, hasWorkspaceId: !!workspaceId },
        },
        { status: 400 },
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
      // トークン断片や生レスポンスはクライアントへ返さない（ログにのみ残す）
      return NextResponse.json(
        {
          error: `Toggl API responded with status ${currentRes.status}`,
          debug: { status: currentRes.status, statusText: currentRes.statusText },
        },
        { status: 502 },
      )
    }

    const currentData = await currentRes.json()

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
        debug: { message: "No current or recent time entries found" },
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
      // 生エントリ・全プロジェクト名などの詳細は開発時のみ返す
      debug:
        process.env.NODE_ENV === "development"
          ? {
              rawEntry: entryData,
              availableProjects: projects,
              projectLookup: { project_id: entryData.project_id, found_project: projectName },
            }
          : undefined,
    }

    return NextResponse.json(responseData)
  } catch (e: any) {
    console.error("Toggl API error:", e)
    return NextResponse.json(
      { error: "Toggl API error", debug: { errorMessage: e.message } },
      { status: 500 },
    )
  }
}
