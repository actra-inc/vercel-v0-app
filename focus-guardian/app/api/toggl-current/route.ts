import { NextResponse } from "next/server"
import type { createServerClient } from "@supabase/ssr"
import {
  getAuthenticatedUser,
  isTogglEnvOwner,
  isValidApiToken,
  isValidWorkspaceId,
} from "@/lib/toggl-server"

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

// トークンをクライアントから受け取らず、ログイン中ユーザーの user_settings から
// サーバー側で解決する。以前はGETクエリでトークンを送っており、Vercelの
// アクセスログに全権トークンが平文で残り続けていた
async function resolveCredentials(
  supabase: ReturnType<typeof createServerClient>,
  user: { id: string; email?: string | null },
): Promise<{ apiToken?: string; workspaceId?: string; queryFailed?: boolean }> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("toggl_api_token, toggl_workspace_id")
    .eq("user_id", user.id)
    .maybeSingle()
  // SELECT失敗（列欠落・一時障害）を「未設定」と混同しない。
  // ここでenvへフォールバックすると、本人の保存値があるのに
  // オーナーのトークンで取得する誤動作や「未設定」誤診につながる
  if (error) {
    console.error("Failed to read Toggl credentials from user_settings:", error.message)
    return { queryFailed: true }
  }

  // 環境変数の資格情報はオーナー本人にだけ許可する。
  // 誰でも使えると、自分のトークンを保存していない別ユーザーに
  // オーナーのToggl作業記録がそのまま見えてしまう
  const envAllowed = isTogglEnvOwner(user)
  if (!data?.toggl_api_token && !envAllowed && process.env.TOGGL_API_TOKEN) {
    console.warn(
      "[toggl] env credentials exist but this user is not the designated owner " +
        "(set TOGGL_OWNER_USER_ID or TOGGL_OWNER_EMAIL to enable personal mode); skipping fallback",
    )
  }

  const apiToken = data?.toggl_api_token || (envAllowed ? process.env.TOGGL_API_TOKEN : undefined)
  const workspaceId = data?.toggl_workspace_id || (envAllowed ? process.env.TOGGL_WORKSPACE_ID : undefined)
  return { apiToken, workspaceId }
}

// 現在のTogglエントリを取得（GET: 保存済み資格情報を使用）
export async function GET() {
  const { user, supabase } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: ログインが必要です" }, { status: 401 })
  }
  const creds = await resolveCredentials(supabase, user)
  if (creds.queryFailed) {
    return NextResponse.json({ error: "Failed to load Toggl settings. Please retry." }, { status: 503 })
  }
  return fetchTogglEntry(creds.apiToken, creds.workspaceId)
}

// 接続テスト用（POST: 保存前の資格情報をボディで受け取って検証する。
// ボディはURLと違いアクセスログに残らない）
export async function POST(request: Request) {
  const { user, supabase } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: ログインが必要です" }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  // 受け取った値は必ず形式検証する。未検証のworkspaceIdはURLパスに埋まるため
  // `../` でTogglの別エンドポイントへ向けられる
  if (body.apiToken !== undefined || body.workspaceId !== undefined) {
    if (!isValidApiToken(body.apiToken) || !isValidWorkspaceId(body.workspaceId)) {
      return NextResponse.json({ error: "Invalid credentials format" }, { status: 400 })
    }
  }
  let apiToken: string | undefined = isValidApiToken(body.apiToken) ? body.apiToken : undefined
  let workspaceId: string | undefined = isValidWorkspaceId(body.workspaceId) ? body.workspaceId : undefined
  if (!apiToken || !workspaceId) {
    const resolved = await resolveCredentials(supabase, user)
    if (resolved.queryFailed) {
      return NextResponse.json({ error: "Failed to load Toggl settings. Please retry." }, { status: 503 })
    }
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

    // 保存済み・環境変数由来の値も検証する（古いデータや設定ミスで
    // 想定外の文字が入っていると、URL組み立てやBasic認証ヘッダー生成が壊れる）
    if (!isValidApiToken(apiToken) || !isValidWorkspaceId(workspaceId)) {
      console.error("Toggl credentials have an unexpected format; refusing to call the API")
      return NextResponse.json({ error: "Stored Toggl credentials have an invalid format." }, { status: 400 })
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
