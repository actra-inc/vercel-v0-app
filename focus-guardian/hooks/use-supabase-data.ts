"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  getCurrentUser,
  getUserSettings,
  updateUserSettings,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getTimeEntries,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getWorkLogs,
  createWorkLog,
  deleteAllWorkLogs,
  type User,
  type Project,
  type TimeEntry,
  type WorkLog,
  type UserSettings,
  type SettingsWriteCause,
} from "@/lib/supabase"
import { createOrUpdateUser } from "@/lib/supabase"
import { DEFAULT_CAPTURE_INTERVAL_SECONDS } from "@/lib/config"

export function useSupabaseData() {
  const [user, setUser] = useState<User | null>(null)
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  // useCallbackでloadUserDataをメモ化して、依存関係の問題を解決
  const loadUserData = useCallback(async () => {
    try {
      // 初回のみローディング表示（再フェッチ時はコンテンツを維持して画面共有を継続）
      if (!hasLoadedRef.current) {
        setLoading(true)
      }
      setError(null)

      const { user: currentUser, error: userError } = await getCurrentUser()

      if (userError || !currentUser) {
        console.log("User not authenticated")
        setLoading(false)
        return
      }

      // public.users 行を担保する（upsertなので冪等）。
      // 全テーブルが REFERENCES public.users(id) を持つため、この行が無いと
      // 新規ユーザーの最初の保存（設定・ログ・プロジェクト）がFK違反で失敗する。
      // 従来この処理は AuthProvider にあったが、AuthProvider はどこからも
      // マウントされておらず、行を作る経路が存在しなかった
      const { error: ensureUserError } = await createOrUpdateUser(currentUser)
      if (ensureUserError) {
        console.warn("Failed to ensure public.users row (will retry next load):", ensureUserError.message)
      }

      setUser({
        id: currentUser.id,
        email: currentUser.email || "",
        name: currentUser.user_metadata?.full_name || currentUser.email || "",
        avatar_url: currentUser.user_metadata?.avatar_url,
        created_at: currentUser.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      // Load user settings
      try {
        const { data: settings, error: settingsError } = await getUserSettings(currentUser.id)

        // 旧仕様でlocalStorageに保存されたToggl資格情報を一度だけDBへ移行する
        // （DB保存に一本化: サーバー側でトークンを解決できるようにし、
        //   端末間でも設定が同期されるようにする）
        const legacyTogglToken =
          typeof window !== "undefined" ? localStorage.getItem("toggl_api_token") || "" : ""
        const legacyTogglWorkspace =
          typeof window !== "undefined" ? localStorage.getItem("toggl_workspace_id") || "" : ""

        if (settingsError) {
          // 取得失敗（ネットワーク断・5xx・JWT失効など）は「未作成」と区別する。
          // ここで既定値を書き込むと、行が実在する場合にUPDATEされて
          // ユーザーのモデル・間隔設定が既定値へ巻き戻ってしまう。
          // 何もせず次回ロードに任せる（表示は page.tsx 側のフォールバック既定値で動く）
          console.warn("Error loading settings (skipping init, will retry next load):", settingsError)
        } else if (settings) {
          // 移行対象は「一度も設定されていない（null/undefined）」場合のみ。
          // 空文字は「明示的にクリアした」印なので、他端末に残る旧localStorage値で
          // 復活させてはいけない
          if (legacyTogglToken && legacyTogglWorkspace && settings.toggl_api_token == null) {
            const { data: migrated, error: migrateError } = await updateUserSettings(currentUser.id, {
              toggl_api_token: legacyTogglToken,
              toggl_workspace_id: legacyTogglWorkspace,
            })
            setUserSettings(migrated || settings)
            // 重要: DB書き込みが成功した場合のみlocalStorageを消す。
            // 失敗時（DBに列が無い等）に消すと、資格情報の最後のコピーを
            // 破壊してしまい「保存したのに消えた」が確定してしまう。
            // 失敗時は残しておけば次回ロードで移行を再試行できる
            if (migrated) {
              localStorage.removeItem("toggl_api_token")
              localStorage.removeItem("toggl_workspace_id")
              console.log("🔁 Migrated Toggl credentials from localStorage to user_settings")
            } else {
              console.warn(
                "⚠️ Toggl credential migration to DB failed; keeping localStorage copy for retry",
                migrateError?.cause,
              )
            }
          } else {
            setUserSettings(settings)
            // DB側が設定済み（または明示クリア済み）なら旧localStorageの平文トークンは
            // もう不要なので掃除する（残すと平文がブラウザに永久残存する）
            if ((legacyTogglToken || legacyTogglWorkspace) && settings.toggl_api_token != null) {
              localStorage.removeItem("toggl_api_token")
              localStorage.removeItem("toggl_workspace_id")
            }
          }
        } else {
          // 行が確実に存在しない（error=null かつ data=null）場合のみ既定値を作成する
          const defaultSettings = {
            gemini_model: "gemini-3.5-flash-lite",
            capture_interval: DEFAULT_CAPTURE_INTERVAL_SECONDS,
            auto_sync_toggl: false,
            // 旧localStorage保存があれば初期作成時に取り込む
            ...(legacyTogglToken && legacyTogglWorkspace
              ? { toggl_api_token: legacyTogglToken, toggl_workspace_id: legacyTogglWorkspace }
              : {}),
          }
          const { data: newSettings } = await updateUserSettings(currentUser.id, defaultSettings)
          if (newSettings) {
            setUserSettings(newSettings)
            if (legacyTogglToken && legacyTogglWorkspace) {
              localStorage.removeItem("toggl_api_token")
              localStorage.removeItem("toggl_workspace_id")
            }
          }
        }
      } catch (err) {
        console.warn("Settings error:", err)
      }

      // Load projects
      try {
        const { data: projectsData, error: projectsError } = await getProjects(currentUser.id)
        if (projectsError) {
          console.warn("Error loading projects:", projectsError)
        } else if (projectsData) {
          setProjects(projectsData)
        }
      } catch (err) {
        console.warn("Projects error:", err)
      }

      // Load time entries
      try {
        const { data: entriesData, error: entriesError } = await getTimeEntries(currentUser.id)
        if (entriesError) {
          console.warn("Error loading time entries:", entriesError)
        } else if (entriesData) {
          setTimeEntries(entriesData)
        }
      } catch (err) {
        console.warn("Time entries error:", err)
      }

      // Load work logs (削除済みタイムスタンプより新しいものだけ表示)
      try {
        const { data: logsData, error: logsError } = await getWorkLogs(currentUser.id)
        if (logsError) {
          console.warn("Error loading work logs:", logsError)
        } else if (logsData) {
          const clearedAt = localStorage.getItem(`work_logs_cleared_at_${currentUser.id}`)
          // レポート（summary/daily等）はログクリアの対象外なので、クリア時刻より古くても表示する
          const filtered = clearedAt
            ? logsData.filter(
                (log) => !!log.report_type || new Date(log.timestamp) > new Date(clearedAt),
              )
            : logsData
          setWorkLogs(filtered)
        }
      } catch (err) {
        console.warn("Work logs error:", err)
      }

      hasLoadedRef.current = true
      setLoading(false)
    } catch (err) {
      console.error("Error loading user data:", err)
      setError(err instanceof Error ? err.message : "Failed to load user data")
      hasLoadedRef.current = true
      setLoading(false)
    }
  }, []) // 空の依存配列

  // Load initial data
  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  // Update settings
  const updateSettings = async (settings: Partial<UserSettings>) => {
    if (!user) {
      throw new Error("User not authenticated")
    }

    console.log("🔄 updateSettings called with keys:", Object.keys(settings))

    try {
      const { data, error } = await updateUserSettings(user.id, settings)

      if (error) {
        console.error("❌ Error updating settings:", error)
        // 呼び出し側が原因別に分岐（フォールバック保存・案内文の出し分け）できるよう、
        // 分類結果をErrorに載せて渡す。message文字列の中身に依存した判定は誤診を招く
        const failure = new Error(error.message) as Error & {
          code?: string
          failureCause?: SettingsWriteCause
          missingColumns?: string[]
        }
        failure.code = error.code
        failure.failureCause = error.cause
        failure.missingColumns = error.missingColumns
        throw failure
      }

      console.log("✅ Settings updated successfully")

      if (data) {
        setUserSettings(data)
      }

      return data
    } catch (error) {
      console.error("❌ Exception in updateSettings:", error)
      throw error
    }
  }

  // Project operations
  // ※ state更新は関数型で行う（古いクロージャ経由の連続操作で直前の変更が消えないように）
  const addProject = async (project: Omit<Project, "id" | "created_at" | "updated_at">) => {
    if (!user) {
      throw new Error("User not authenticated")
    }
    // 呼び出し側は user_id を渡してこないため、ここで補完する。
    // RLSのINSERTポリシーは auth.uid() = user_id を要求するので、
    // 未設定のままだと必ず違反してプロジェクト作成が失敗する
    const { data, error } = await createProject({ ...project, user_id: user.id })
    if (error) throw new Error(error.message || "Failed to create project")
    if (data) {
      setProjects((prev) => [...prev, data])
    }
    return data
  }

  const editProject = async (id: string, updates: Partial<Project>) => {
    const { data, error } = await updateProject(id, updates)
    if (error) throw new Error(error.message || "Failed to update project")
    if (data) {
      setProjects((prev) => prev.map((p) => (p.id === id ? data : p)))
    }
    return data
  }

  const removeProject = async (id: string) => {
    const { error } = await deleteProject(id)
    if (error) throw new Error(error.message || "Failed to delete project")
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  // Time entry operations
  const addTimeEntry = async (entry: Omit<TimeEntry, "id" | "created_at" | "updated_at">) => {
    const { data, error } = await createTimeEntry(entry)
    if (error) throw new Error(error.message || "Failed to create time entry")
    if (data) {
      setTimeEntries((prev) => [data, ...prev])
    }
    return data
  }

  const editTimeEntry = async (id: string, updates: Partial<TimeEntry>) => {
    const { data, error } = await updateTimeEntry(id, updates)
    if (error) throw new Error(error.message || "Failed to update time entry")
    if (data) {
      setTimeEntries((prev) => prev.map((e) => (e.id === id ? data : e)))
    }
    return data
  }

  const removeTimeEntry = async (id: string) => {
    const { error } = await deleteTimeEntry(id)
    if (error) throw new Error(error.message || "Failed to delete time entry")
    setTimeEntries((prev) => prev.filter((e) => e.id !== id))
  }

  // Work log operations
  const addWorkLog = async (log: Omit<WorkLog, "id" | "created_at">) => {
    if (!user) {
      throw new Error("User not authenticated")
    }

    const { data, error } = await createWorkLog({ ...log, user_id: user.id })
    if (error) {
      // ネットワーク一時エラーはthrowせずwarnに留める
      const msg = error.message || ""
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")) {
        console.warn("⚠️ Work log save skipped (network):", msg)
        return null
      }
      throw new Error(msg || "Failed to create work log")
    }
    if (data) {
      // 通常ログの追加時のみ削除タイムスタンプをリセットする
      // クリア時刻マーカーは残し続ける（フィルタは「クリア時刻より古い通常ログ」
      // だけを隠すので、新しいログの表示には影響しない）。
      // 以前はここで新規ログのたびにマーカーを削除しており、DB削除が効いて
      // いない環境（RLSのDELETEポリシー未設定）では次回ロード時に
      // クリア済みログが全件復活していた
      // DBに保存されない/加工されるフィールドを、セッション中の表示用に
      // ローカルの値で補ってstateへ反映する:
      //  - screenshot_url: blob: URLはinsert前に除去される
      //  - distraction_check: insert前に常に除去されるため、補わないと
      //    脱線詳細パネル（理由・重大度）が追加直後から一切表示されない
      //  - report_data: source_screenshots の blob: が除去されるため、
      //    セッション中はローカル版を使ってサムネイルを表示する
      let merged: typeof data = data
      if (log.screenshot_url && !data.screenshot_url) {
        merged = { ...merged, screenshot_url: log.screenshot_url }
      }
      if (log.distraction_check && !merged.distraction_check) {
        merged = { ...merged, distraction_check: log.distraction_check }
      }
      if (log.report_data) {
        merged = { ...merged, report_data: log.report_data }
      }
      setWorkLogs((prev) => [merged, ...prev])
      return merged
    }
    return data
  }

  const clearWorkLogs = async (): Promise<{ dbDeleteFailed: boolean }> => {
    if (!user) {
      throw new Error("User not authenticated")
    }

    const regularCount = workLogs.filter((log) => !log.report_type).length

    // 削除タイムスタンプを先に記録（DB削除が失敗しても再表示されないよう）
    const clearedAt = new Date().toISOString()
    localStorage.setItem(`work_logs_cleared_at_${user.id}`, clearedAt)
    // レポート（summary/daily）はクリア対象外なので残す
    setWorkLogs((prev) => prev.filter((log) => !!log.report_type))

    // DB削除はベストエフォート（失敗してもlocalStorageで隠蔽）
    // ただし0件削除（RLSのDELETEポリシー未設定）は呼び出し側に伝えて警告できるようにする
    try {
      const { error, deletedCount } = await deleteAllWorkLogs(user.id)
      if (error) {
        console.warn("DB delete work logs warning:", error.message)
        return { dbDeleteFailed: true }
      }
      return { dbDeleteFailed: regularCount > 0 && deletedCount === 0 }
    } catch (err) {
      console.warn("DB delete work logs failed:", err)
      return { dbDeleteFailed: true }
    }
  }

  return {
    user,
    userSettings,
    projects,
    timeEntries,
    workLogs,
    loading,
    error,
    updateSettings,
    addProject,
    editProject,
    removeProject,
    addTimeEntry,
    editTimeEntry,
    removeTimeEntry,
    addWorkLog,
    clearWorkLogs,
    refreshData: loadUserData,
  }
}
