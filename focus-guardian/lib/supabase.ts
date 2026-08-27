import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Types
export interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  color: string
  client?: string
  created_at: string
  updated_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  project_id: string
  description: string
  start_time: string
  end_time?: string
  duration: number
  tags: string[]
  created_at: string
  updated_at: string
}

export interface ReportData {
  summary: string
  productivity_analysis: string
  focus_trend: string
  distraction_summary: string
  time_distribution: {
    productive_time: number
    distracted_time: number
    neutral_time: number
  }
  key_findings: string[]
  recommendations: string[]
  overall_score: number
}

export interface WorkLog {
  id: string
  user_id: string
  timestamp: string
  activity: string
  category: "productive" | "distracted" | "neutral"
  details: string
  screenshot_url?: string
  confidence?: number
  applications: string[]
  focus_score?: number
  distraction_check?: {
    is_distracted: boolean
    reason: string
    planned_task: string
    severity: "high" | "medium" | "low"
  }
  work_category?: string
  report_type?: string
  report_data?: ReportData
  created_at: string
}

export interface UserSettings {
  id: string
  user_id: string
  gemini_api_key?: string
  gemini_model: string
  toggl_api_token?: string
  toggl_workspace_id?: string
  capture_interval: number
  auto_sync_toggl: boolean
  created_at: string
  updated_at: string
}

// Helper function to convert date strings to Date objects
function parseWorkLog(log: any): WorkLog {
  return {
    ...log,
    timestamp: typeof log.timestamp === "string" ? log.timestamp : new Date(log.timestamp).toISOString(),
    created_at: typeof log.created_at === "string" ? log.created_at : new Date(log.created_at).toISOString(),
  }
}

function parseTimeEntry(entry: any): TimeEntry {
  return {
    ...entry,
    start_time: typeof entry.start_time === "string" ? entry.start_time : new Date(entry.start_time).toISOString(),
    end_time: entry.end_time
      ? typeof entry.end_time === "string"
        ? entry.end_time
        : new Date(entry.end_time).toISOString()
      : undefined,
    created_at: typeof entry.created_at === "string" ? entry.created_at : new Date(entry.created_at).toISOString(),
    updated_at: typeof entry.updated_at === "string" ? entry.updated_at : new Date(entry.updated_at).toISOString(),
  }
}

// Auth helpers
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      scopes: "https://www.googleapis.com/auth/calendar.readonly",
    },
  })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return { user, error }
}

// Database helpers
export const createOrUpdateUser = async (user: any) => {
  const { data, error } = await supabase
    .from("users")
    .upsert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email,
      avatar_url: user.user_metadata?.avatar_url,
    })
    .select()
    .single()

  return { data, error }
}

export const getUserSettings = async (userId: string) => {
  // .single() は0行を PGRST116 エラーにするため「未作成」と「取得失敗」を
  // 区別できない。maybeSingle() なら 0行 = { data: null, error: null }
  const { data, error } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle()

  return { data, error }
}

/**
 * user_settings への書き込みが失敗した原因の分類。
 * 「保存できません」だけでは対処できないため、UI側で原因別の案内を出すために使う
 */
export type SettingsWriteCause =
  | "missing_table" // テーブル自体が無い
  | "missing_column" // 列が無い
  | "stale_schema_cache" // 列はあるがPostgRESTのスキーマキャッシュが古い
  | "no_user_row" // public.users に行が無くFK違反
  | "rls_blocked" // RLSで弾かれた（0行更新を含む）
  | "network" // 通信断
  | "unknown"

export interface SettingsWriteError {
  message: string
  code?: string
  cause: SettingsWriteCause
  /** 書き込めなかった列名（判明した場合） */
  missingColumns?: string[]
}

// PGRST204: "Could not find the 'toggl_api_token' column of 'user_settings' in the schema cache"
// 42703  : "column user_settings.toggl_api_token does not exist"
const MISSING_COLUMN_RE = /Could not find the '([^']+)' column|column "?([\w.]+)"? does not exist/i

function classifyDbError(error: any): { cause: SettingsWriteCause; missingColumns?: string[] } {
  const code = String(error?.code ?? "")
  const text = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`

  if (code === "PGRST205" || code === "42P01" || /Could not find the table|relation .* does not exist/i.test(text)) {
    return { cause: "missing_table" }
  }
  if (code === "PGRST204" || code === "42703" || MISSING_COLUMN_RE.test(text)) {
    const m = text.match(MISSING_COLUMN_RE)
    const name = (m?.[1] || m?.[2] || "").replace(/^.*\./, "")
    return { cause: "missing_column", missingColumns: name ? [name] : undefined }
  }
  if (code === "23503") return { cause: "no_user_row" }
  // 23505: 行は存在するのにSELECTで見えない（SELECTポリシー欠落）ときのINSERT衝突
  if (code === "42501" || code === "23505" || code === "NO_ROW_WRITTEN" || /row-level security|permission denied/i.test(text)) {
    return { cause: "rls_blocked" }
  }
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(text)) return { cause: "network" }
  return { cause: "unknown" }
}

/** 1回分の書き込み（行があればUPDATE、無ければINSERT） */
async function writeUserSettingsOnce(userId: string, payload: Record<string, any>) {
  // limit(1) + 配列受けにしているのは、UNIQUE制約が無いDBで行が重複していても
  // PGRST116（"multiple (or no) rows returned"）で保存全体が失敗しないようにするため
  const { data: existing, error: fetchError } = await supabase
    .from("user_settings")
    .select("id")
    .eq("user_id", userId)
    .limit(1)

  if (fetchError) return { data: null as any, error: fetchError as any }

  if (existing && existing.length > 0) {
    const { data, error } = await supabase.from("user_settings").update(payload).eq("user_id", userId).select()
    if (error) return { data: null as any, error: error as any }
    // 0行更新はRLSのUPDATEポリシー欠落が典型。.single() だとPGRST116に潰れて
    // 原因が読めないため、明示的に検出して専用コードで返す
    if (!data || data.length === 0) {
      return { data: null as any, error: { code: "NO_ROW_WRITTEN", message: "Update affected 0 rows" } as any }
    }
    return { data: data[0], error: null as any }
  }

  const { data, error } = await supabase
    .from("user_settings")
    .insert({ user_id: userId, ...payload })
    .select()
  if (error) return { data: null as any, error: error as any }
  if (!data || data.length === 0) {
    return { data: null as any, error: { code: "NO_ROW_WRITTEN", message: "Insert returned no row" } as any }
  }
  return { data: data[0], error: null as any }
}

export const updateUserSettings = async (
  userId: string,
  settings: Partial<UserSettings>,
): Promise<{ data: any; error: SettingsWriteError | null }> => {
  // 注意: settings には gemini_api_key / toggl_api_token が含まれるため
  // 値そのものはログに出さない（ブラウザコンソールへの平文露出を防ぐ）
  console.log("💾 updateUserSettings called with keys:", { userId, keys: Object.keys(settings) })

  // updated_at はこちら側で付ける付加情報なので、その列が無い環境では
  // 落として保存を成立させてよい。呼び出し側が指定した列は絶対に落とさない
  // （落とすと「保存できたのに値が入っていない」無言の失敗になる）
  const payload: Record<string, any> = { ...settings, updated_at: new Date().toISOString() }
  let repairedUserRow = false

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await writeUserSettingsOnce(userId, payload)
    if (!error) return { data, error: null }

    const { cause, missingColumns } = classifyDbError(error)
    console.error("❌ user_settings write failed:", { code: error?.code, cause, missingColumns })

    // 付加情報の列が無いだけなら、その列を除いて再試行する
    const droppable = (missingColumns ?? []).filter((c) => c in payload && !(c in settings))
    if (cause === "missing_column" && droppable.length > 0) {
      droppable.forEach((c) => delete payload[c])
      console.warn("⚠️ Retrying without missing column(s):", droppable)
      continue
    }

    // public.users に行が無い場合（FK違反）は行を作ってから一度だけ再試行する
    if (cause === "no_user_row" && !repairedUserRow) {
      repairedUserRow = true
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (authUser?.id === userId) {
        await createOrUpdateUser(authUser)
        console.warn("⚠️ Created missing public.users row; retrying settings write")
        continue
      }
    }

    return {
      data: null,
      error: {
        message: error?.message || "Unknown error",
        code: error?.code,
        cause,
        missingColumns,
      },
    }
  }

  return {
    data: null,
    error: { message: "Settings write did not complete after retries", cause: "unknown" },
  }
}

export interface UserSettingsDiagnosis {
  cause: SettingsWriteCause | "ok"
  /** 生のエラーメッセージなど、原因を特定するための手掛かり */
  detail: string
  missingColumns?: string[]
  /** どのSupabaseプロジェクトに接続しているか（SQLを別プロジェクトで流した事故の切り分け用） */
  projectRef?: string
}

/** 接続先Supabaseプロジェクトの識別子（例: abcdefgh.supabase.co → abcdefgh） */
export const getSupabaseProjectRef = (): string => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || ""
  } catch {
    return ""
  }
}

/**
 * user_settings に読み書きできない理由を実際に問い合わせて特定する。
 * 「Supabase側の問題なのか、コード側の問題なのか」をユーザーの環境で断定するために使う
 */
export const diagnoseUserSettings = async (
  userId: string,
  writeError?: SettingsWriteError | null,
): Promise<UserSettingsDiagnosis> => {
  const projectRef = getSupabaseProjectRef()

  // 1. テーブルの存在
  const table = await supabase.from("user_settings").select("user_id").limit(1)
  if (table.error) {
    const c = classifyDbError(table.error)
    return { cause: c.cause === "unknown" ? "missing_table" : c.cause, detail: table.error.message, projectRef }
  }

  // 2. 列の存在（列が無ければPostgRESTではなくPGが 42703 を返す）。
  //    書き込み時に名指しされた列を優先して調べる
  const suspects = (writeError?.missingColumns ?? []).filter((c) => /^[a-z0-9_]+$/i.test(c))
  const probeColumns = suspects.length > 0 ? suspects : ["toggl_api_token", "toggl_workspace_id"]
  const cols = await supabase.from("user_settings").select(probeColumns.join(", ")).limit(1)
  if (cols.error) {
    const c = classifyDbError(cols.error)
    return {
      cause: "missing_column",
      missingColumns: c.missingColumns ?? probeColumns,
      detail: cols.error.message,
      projectRef,
    }
  }

  // 列は実在するのに書き込みがPGRST204で弾かれた場合は、PostgRESTの
  // スキーマキャッシュが古い（ALTER TABLE後にリロードされていない）
  if (writeError?.cause === "missing_column" || writeError?.code === "PGRST204") {
    return {
      cause: "stale_schema_cache",
      missingColumns: writeError?.missingColumns,
      detail: writeError?.message ?? "",
      projectRef,
    }
  }

  // 3. 自分の行の存在
  const row = await supabase.from("user_settings").select("id").eq("user_id", userId).maybeSingle()
  if (row.error) {
    const c = classifyDbError(row.error)
    return { cause: c.cause, missingColumns: c.missingColumns, detail: row.error.message, projectRef }
  }
  if (!row.data) {
    const owner = await supabase.from("users").select("id").eq("id", userId).maybeSingle()
    if (!owner.error && !owner.data) {
      return { cause: "no_user_row", detail: "public.users にログイン中ユーザーの行がありません", projectRef }
    }
    return { cause: "unknown", detail: "user_settings に行がまだありません", projectRef }
  }

  // 4. 書き込み可否（updated_at だけ触る無害な更新）
  const write = await supabase
    .from("user_settings")
    .update({ updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("user_id")
  if (write.error) {
    const c = classifyDbError(write.error)
    return { cause: c.cause, missingColumns: c.missingColumns, detail: write.error.message, projectRef }
  }
  if (!write.data || write.data.length === 0) {
    return { cause: "rls_blocked", detail: "user_settings の行を更新できませんでした（0行）", projectRef }
  }

  return { cause: "ok", detail: "user_settings への読み書きは正常です", projectRef }
}

export const getProjects = async (userId: string) => {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  return { data, error }
}

export const createProject = async (project: Omit<Project, "id" | "created_at" | "updated_at">) => {
  const { data, error } = await supabase.from("projects").insert(project).select().single()

  return { data, error }
}

export const updateProject = async (id: string, updates: Partial<Project>) => {
  const { data, error } = await supabase.from("projects").update(updates).eq("id", id).select().single()

  return { data, error }
}

export const deleteProject = async (id: string) => {
  const { error } = await supabase.from("projects").delete().eq("id", id)

  return { error }
}

export const getTimeEntries = async (userId: string, date?: string) => {
  let query = supabase
    .from("time_entries")
    .select(`
      *,
      projects:project_id (
        id,
        name,
        color,
        client
      )
    `)
    .eq("user_id", userId)
    .order("start_time", { ascending: false })

  if (date) {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    query = query.gte("start_time", startOfDay.toISOString()).lte("start_time", endOfDay.toISOString())
  }

  const { data, error } = await query

  // Parse date strings to ensure consistency
  if (data) {
    return { data: data.map(parseTimeEntry), error }
  }

  return { data, error }
}

export const createTimeEntry = async (entry: Omit<TimeEntry, "id" | "created_at" | "updated_at">) => {
  const { data, error } = await supabase.from("time_entries").insert(entry).select().single()

  if (data) {
    return { data: parseTimeEntry(data), error }
  }

  return { data, error }
}

export const updateTimeEntry = async (id: string, updates: Partial<TimeEntry>) => {
  const { data, error } = await supabase.from("time_entries").update(updates).eq("id", id).select().single()

  if (data) {
    return { data: parseTimeEntry(data), error }
  }

  return { data, error }
}

export const deleteTimeEntry = async (id: string) => {
  const { error } = await supabase.from("time_entries").delete().eq("id", id)

  return { error }
}

export const getWorkLogs = async (userId: string, limit = 500) => {
  const { data, error } = await supabase
    .from("work_logs")
    .select("*")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false })
    .limit(limit)

  // Parse date strings to ensure consistency
  if (data) {
    return { data: data.map(parseWorkLog), error }
  }

  return { data, error }
}

export const createWorkLog = async (log: Omit<WorkLog, "id" | "created_at">) => {
  const { distraction_check: _dc, ...insertLog } = log as any
  // blob: URL はセッション限りで無効になるため DB には保存しない
  // （セッション中の表示は呼び出し側でローカル値をマージして維持する）
  if (typeof insertLog.screenshot_url === "string" && insertLog.screenshot_url.startsWith("blob:")) {
    delete insertLog.screenshot_url
  }
  // report_data.source_screenshots 内の blob: URL も同様にDBへ入れない
  // （リロード後・他端末では必ず壊れ画像になる。セッション中の表示は
  //   addWorkLog のローカルマージで維持される）
  if (Array.isArray(insertLog.report_data?.source_screenshots)) {
    const persistable = insertLog.report_data.source_screenshots.filter(
      (u: unknown) => typeof u === "string" && !u.startsWith("blob:"),
    )
    insertLog.report_data = { ...insertLog.report_data, source_screenshots: persistable }
  }
  const { data, error } = await supabase.from("work_logs").insert(insertLog).select().single()

  if (data) {
    return { data: parseWorkLog(data), error }
  }

  return { data, error }
}

// 注意: RLSのDELETEポリシーが無い環境では、Supabaseはエラーを返さず
// 「0行削除」で成功扱いになる。.select("id") で削除された行を返させ、
// 削除件数を呼び出し側で検証できるようにする。
export const deleteWorkLog = async (id: string) => {
  const { data, error } = await supabase.from("work_logs").delete().eq("id", id).select("id")

  return { error, deletedCount: data?.length ?? 0 }
}

export const deleteAllWorkLogs = async (userId: string) => {
  // 「作業ログの全クリア」ではレポート（report_type付きの行）は削除しない
  // （レポートはReportsタブの deleteAllReports で別管理）
  const { data, error } = await supabase
    .from("work_logs")
    .delete()
    .eq("user_id", userId)
    .is("report_type", null)
    .select("id")

  return { error, deletedCount: data?.length ?? 0 }
}

export const deleteAllReports = async (userId: string) => {
  // summary（集中レポート）と daily（日報）の両方を対象にする
  const { data, error } = await supabase
    .from("work_logs")
    .delete()
    .eq("user_id", userId)
    .not("report_type", "is", null)
    .select("id")

  return { error, deletedCount: data?.length ?? 0 }
}

export const getReports = async (userId: string, limit = 20) => {
  const { data, error } = await supabase
    .from("work_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("report_type", "summary")
    .order("timestamp", { ascending: false })
    .limit(limit)

  if (data) {
    return { data: data.map(parseWorkLog), error }
  }

  return { data, error }
}

// Storage helpers for screenshots
export const uploadScreenshot = async (file: File, userId: string) => {
  const fileExt = file.name.split(".").pop()
  const fileName = `${userId}/${Date.now()}.${fileExt}`

  const { data, error } = await supabase.storage.from("screenshots").upload(fileName, file)

  if (error) return { data: null, error }

  const {
    data: { publicUrl },
  } = supabase.storage.from("screenshots").getPublicUrl(fileName)

  return { data: { path: fileName, publicUrl }, error: null }
}
