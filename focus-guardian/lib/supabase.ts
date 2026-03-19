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
  const { data, error } = await supabase.from("user_settings").select("*").eq("user_id", userId).single()

  return { data, error }
}

export const updateUserSettings = async (userId: string, settings: Partial<UserSettings>) => {
  console.log("💾 updateUserSettings called with:", { userId, settings })

  try {
    // まず既存の設定を取得
    const { data: existingSettings, error: fetchError } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    console.log("📊 Existing settings:", { existingSettings, fetchError })

    if (fetchError) {
      console.error("❌ Error fetching existing settings:", fetchError)
      return { data: null, error: fetchError.message }
    }

    // 更新データを準備
    const updateData = {
      user_id: userId,
      ...settings,
      updated_at: new Date().toISOString(),
    }

    console.log("📤 Update data:", updateData)

    // 既存レコードが存在する場合は更新、存在しない場合は挿入
    if (existingSettings) {
      // 既存レコードを更新
      console.log("🔄 Updating existing settings...")
      const { data, error } = await supabase
        .from("user_settings")
        .update(updateData)
        .eq("user_id", userId)
        .select()
        .single()

      if (error) {
        console.error("❌ Update error:", error)
        return { data: null, error: error.message }
      }

      console.log("✅ Settings updated successfully:", data)
      return { data, error: null }
    } else {
      // 新規レコードを挿入
      console.log("➕ Inserting new settings...")
      const { data, error } = await supabase.from("user_settings").insert(updateData).select().single()

      if (error) {
        console.error("❌ Insert error:", error)
        return { data: null, error: error.message }
      }

      console.log("✅ Settings inserted successfully:", data)
      return { data, error: null }
    }
  } catch (error) {
    console.error("❌ Exception in updateUserSettings:", error)
    return { data: null, error: error instanceof Error ? error.message : "Unknown error" }
  }
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
  const { data, error } = await supabase.from("work_logs").insert(log).select().single()

  if (data) {
    return { data: parseWorkLog(data), error }
  }

  return { data, error }
}

export const deleteWorkLog = async (id: string) => {
  const { error } = await supabase.from("work_logs").delete().eq("id", id)

  return { error }
}

export const deleteAllWorkLogs = async (userId: string) => {
  const { error } = await supabase.from("work_logs").delete().eq("user_id", userId)

  return { error }
}

export const deleteAllReports = async (userId: string) => {
  const { error } = await supabase.from("work_logs").delete().eq("user_id", userId).eq("report_type", "summary")

  return { error }
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
