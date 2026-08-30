"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import {
  supabase,
  signInWithGoogle,
  diagnoseUserSettings,
  getWorkLogsInRange,
  type UserSettingsDiagnosis,
} from "@/lib/supabase"
import { useSupabaseData } from "@/hooks/use-supabase-data"
import type { TogglSaveResult } from "@/components/toggl-settings"
import {
  readScopedTogglCredentials,
  writeScopedTogglCredentials,
  clearTogglCredentials,
} from "@/lib/toggl-credentials"
import { TimeTracker } from "@/components/time-tracker"
import { WorkLogPanel } from "@/components/work-log-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { ReportsTab } from "@/components/reports-tab"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Settings, LogOut, Activity, FileText, BarChart3, Camera, Brain, Calendar, Shield, CheckCircle, TrendingUp } from "lucide-react"
import { ActivityBreakdown, DEFAULT_CATEGORIES, type ActivityCategory } from "@/components/activity-breakdown"
import { VersionBadge } from "@/components/version-badge"
import { useTranslation } from "@/lib/i18n"
import { DEFAULT_CAPTURE_INTERVAL_SECONDS, normalizeNudgePreferences } from "@/lib/config"

const Page = () => {
  const { t } = useTranslation()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const isLoggedInRef = useRef(false)
  const [currentTask, setCurrentTask] = useState("")
  const [currentTab, setCurrentTab] = useState("logs")
  // ログイン失敗の理由（/auth/callback から ?auth_error= で渡される）
  const [authError, setAuthError] = useState<{ code: string; detail: string } | null>(null)
  const [screenSessions, setScreenSessions] = useState<Array<{ id: string; startTime: Date; endTime?: Date; task: string }>>([])
  // 他タブ表示中も解析が続いていることをヘッダーで示すためのフラグ
  const [isScreenTracking, setIsScreenTracking] = useState(false)
  // 設定画面を開くときに、どのタブを選択した状態で開くか
  const [settingsInitialTab, setSettingsInitialTab] = useState("gemini")

  const openSettings = useCallback((tab: string = "gemini") => {
    setSettingsInitialTab(tab)
    setCurrentTab("settings")
  }, [])
  const screenSessionStartRef = useRef<{ time: Date; task: string } | null>(null)
  // Toggl資格情報はuser_settings（DB）が正。旧localStorage保存は
  // use-supabase-data側で一度だけDBへ移行される
  const [categories, setCategories] = useState<ActivityCategory[]>(() => {
    if (typeof window === "undefined") return DEFAULT_CATEGORIES
    try {
      const saved = localStorage.getItem("activity_categories")
      if (!saved) return DEFAULT_CATEGORIES
      const parsed: ActivityCategory[] = JSON.parse(saved)
      // "その他" → "未分類" へ移行
      return parsed.map((c) => c.name === "その他" ? { ...c, name: "未分類" } : c)
    } catch {
      return DEFAULT_CATEGORIES
    }
  })

  const handleCategoriesChange = useCallback((newCategories: ActivityCategory[]) => {
    setCategories(newCategories)
    localStorage.setItem("activity_categories", JSON.stringify(newCategories))
  }, [])

  const handleTrackingChange = useCallback((isTracking: boolean, startTime: Date | null) => {
    setIsScreenTracking(isTracking)
    if (isTracking && startTime) {
      screenSessionStartRef.current = { time: startTime, task: currentTask }
    } else {
      const started = screenSessionStartRef.current
      if (started) {
        const now = new Date()
        setScreenSessions((prev) => [
          { id: Date.now().toString(), startTime: started.time, endTime: now, task: started.task },
          ...prev,
        ])
        screenSessionStartRef.current = null
      }
    }
  }, [currentTask])

  const {
    user,
    userSettings,
    projects,
    timeEntries,
    workLogs,
    loading,
    updateSettings,
    addProject,
    editProject,
    removeProject,
    addWorkLog,
    clearWorkLogs,
    refreshData,
  } = useSupabaseData()

  // ログイン失敗理由をURLから拾って表示する（拾ったらURLからは消す）
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const code = params.get("auth_error") || params.get("error")
    if (!code) return
    setAuthError({ code, detail: params.get("auth_detail") || params.get("error_description") || "" })
    const url = new URL(window.location.href)
    ;["auth_error", "auth_detail", "error", "error_description", "error_code"].forEach((k) =>
      url.searchParams.delete(k),
    )
    window.history.replaceState({}, "", url.toString())
  }, [])

  // Supabaseの Redirect URLs にコールバックURLが未登録だと、認証コードが
  // /auth/callback ではなくトップページ（Site URL）に ?code= で届く。
  // その場合でもログインを成立させるため、ここでも交換を試みる。
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    if (!code) return

    const stripCode = () => {
      const url = new URL(window.location.href)
      url.searchParams.delete("code")
      window.history.replaceState({}, "", url.toString())
    }

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ data, error }) => {
        stripCode()
        if (error || !data?.session) {
          // 別ドメインへ飛ばされた場合、PKCEのcode_verifierが無いので必ずここに来る
          setAuthError({
            code: "code_on_root",
            detail:
              error?.message ||
              "認証コードがトップページに届きましたが、セッションを作成できませんでした。",
          })
          return
        }
        setIsLoggedIn(true)
        isLoggedInRef.current = true
        setAuthChecked(true)
        refreshData()
      })
      .catch((err) => {
        stripCode()
        setAuthError({ code: "code_on_root", detail: String(err?.message || err) })
      })
  }, [])

  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (mounted) {
          setIsLoggedIn(!!session)
          setAuthChecked(true)
        }
      } catch (error) {
        console.error("Auth check error:", error)
        if (mounted) {
          setAuthChecked(true)
        }
      }
    }

    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        const wasLoggedIn = isLoggedInRef.current
        isLoggedInRef.current = !!session
        setIsLoggedIn(!!session)
        setAuthChecked(true)

        // 実際に新規ログインした時だけデータをリフレッシュ
        // TOKEN_REFRESHED や タブ復帰時の SIGNED_IN 再発火では refreshData を呼ばない
        if (event === "SIGNED_IN" && session && !wasLoggedIn) {
          refreshData()
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // 依存配列を空にして初回のみ実行


  const handleApiKeyChange = useCallback(
    async (apiKey: string) => {
      try {
        console.log("🔄 handleApiKeyChange called with key:", apiKey ? "***" : "(empty)")
        await updateSettings({ gemini_api_key: apiKey })
        await refreshData()
        console.log("✅ API key updated successfully")
      } catch (error) {
        console.error("❌ Failed to update API key:", error)
        throw error
      }
    },
    [updateSettings, refreshData],
  )

  // Toggl資格情報の保存先はDB(user_settings)が正。ただしDB側に列が無い等で
  // 保存できない環境では、この端末のlocalStorageへ退避して連携自体は動くようにする
  // （次回ロード時に use-supabase-data 側がDBへの移行を自動で再試行する）
  // 退避先はユーザーIDで分ける（共有端末で別アカウントにログインしたときに
  // 他人のトークンを拾わないようにするため）
  const [togglLocalCreds, setTogglLocalCreds] = useState<{ token: string; workspaceId: string } | null>(null)

  useEffect(() => {
    if (!user?.id) {
      setTogglLocalCreds(null)
      return
    }
    setTogglLocalCreds(readScopedTogglCredentials(user.id))
  }, [user?.id])

  const togglApiToken = userSettings?.toggl_api_token || togglLocalCreds?.token || ""
  const togglWorkspaceId = userSettings?.toggl_workspace_id || togglLocalCreds?.workspaceId || ""
  // DBに無く端末ローカルだけにある場合、サーバーはトークンを解決できないため
  // API呼び出し時にクライアントから渡す必要がある
  const togglCredentialsLocalOnly = !userSettings?.toggl_api_token && Boolean(togglLocalCreds?.token)

  const handleTogglCredentialsChange = useCallback(
    async (token: string, workspaceId: string): Promise<TogglSaveResult> => {
      try {
        await updateSettings({ toggl_api_token: token, toggl_workspace_id: workspaceId })
        // DBに入ったので端末ローカルの退避コピーは不要
        if (user?.id) clearTogglCredentials(user.id)
        setTogglLocalCreds(null)
        return { stored: "db" }
      } catch (error: any) {
        // 「列が無い」と決め打ちせず、実際に問い合わせて原因を確定させる
        // （列が無いのか / 列はあるがPostgRESTのキャッシュが古いのか / RLSで弾かれているのか）
        let diagnosis: UserSettingsDiagnosis | null = null
        try {
          if (user) {
            diagnosis = await diagnoseUserSettings(user.id, {
              message: String(error?.message ?? ""),
              code: error?.code,
              cause: error?.failureCause ?? "unknown",
              missingColumns: error?.missingColumns,
            })
          }
        } catch (diagError) {
          console.warn("Failed to diagnose user_settings:", diagError)
        }

        const cause = diagnosis && diagnosis.cause !== "ok" ? diagnosis.cause : error?.failureCause
        if (error && typeof error === "object") {
          error.failureCause = cause
          error.diagnosisDetail = diagnosis?.detail
          error.projectRef = diagnosis?.projectRef
        }

        // DB側のスキーマが原因なら、この端末へ退避して機能自体は使えるようにする
        const schemaIssue =
          cause === "missing_column" || cause === "missing_table" || cause === "stale_schema_cache"
        if (schemaIssue && user?.id) {
          try {
            if (token && workspaceId) {
              writeScopedTogglCredentials(user.id, { token, workspaceId })
              // 書き込めたか確認する（プライベートモード等では保存されない）。
              // 保存できていないのに「この端末に保存しました」と出すと、
              // 実際には資格情報がどこにも残らない
              if (!readScopedTogglCredentials(user.id)) {
                throw new Error("local fallback storage is unavailable")
              }
              setTogglLocalCreds({ token, workspaceId })
            } else {
              clearTogglCredentials(user.id)
              setTogglLocalCreds(null)
            }
            return {
              stored: "local",
              cause,
              detail: [diagnosis?.detail, diagnosis?.projectRef && `project: ${diagnosis.projectRef}`]
                .filter(Boolean)
                .join(" / "),
            }
          } catch (storageError) {
            console.warn("Local fallback storage failed:", storageError)
          }
        }
        throw error
      }
    },
    [updateSettings, user],
  )

  // 休憩・無操作リマインドの設定（DB値を正規化。列が無くても既定値で動く）
  const nudgePreferences = useMemo(
    () => normalizeNudgePreferences(userSettings?.nudge_preferences),
    [userSettings?.nudge_preferences],
  )

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
  }, [])

  const handleGenerateReport = useCallback(async () => {
    const regularLogs = workLogs.filter((log: any) => !log.report_type)
    if (regularLogs.length < 3) throw new Error("Need at least 3 logs")
    const apiKey = userSettings?.gemini_api_key
    if (!apiKey) throw new Error("API key not set")

    const sourceLogs = regularLogs.slice(0, 3)
    const response = await fetch("/api/generate-summary-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // model は意図的に送らない。レポート生成はサーバー既定の Gemma を使い、
      // 解析モデル（Gemini）と無料枠のバケットを分離する
      body: JSON.stringify({
        workLogs: sourceLogs,
        apiKey,
        // 利用者のタイムゾーンでレポート内の時刻を整形させる
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const reportData = await response.json()

    const sourceScreenshots = sourceLogs
      .map((log: any) => log.screenshot_url)
      .filter((url: any): url is string => typeof url === "string" && url.length > 0)

    // もとになった作業ログの時刻レンジと件数（レポートカードの「対象」表示に使う）
    const sourceTimes = sourceLogs.map((log: any) => new Date(log.timestamp).getTime())
    const sourceRange = {
      from: new Date(Math.min(...sourceTimes)).toISOString(),
      to: new Date(Math.max(...sourceTimes)).toISOString(),
      count: sourceLogs.length,
    }

    const savedReport = await addWorkLog({
      user_id: user?.id || "",
      timestamp: new Date().toISOString(),
      activity: t('wlp_autoReport'),
      category: "neutral",
      details: reportData.summary,
      applications: [],
      report_type: "summary",
      report_data: { ...reportData, source_screenshots: sourceScreenshots, source_range: sourceRange },
    })
    if (!savedReport) {
      // addWorkLogはネットワーク系エラーでthrowせずnullを返す。
      // ここでthrowしないとレポートが無言で消える（呼び出し元のcatchが表示を出す）
      throw new Error("Report save failed (network error)")
    }
  }, [workLogs, userSettings, addWorkLog, t])

  // 今日（ローカル日付）の通常ログ。日報生成の素材になる
  const todayRegularLogs = useMemo(() => {
    const todayStr = new Date().toDateString()
    return workLogs.filter(
      (log: any) => !log.report_type && new Date(log.timestamp).toDateString() === todayStr,
    )
  }, [workLogs])

  const handleGenerateDailyReport = useCallback(async () => {
    const apiKey = userSettings?.gemini_api_key
    if (!apiKey) throw new Error("API key not set")
    // 「今日」はクリック時点で判定し直す（useMemo版は日付をまたぐと
    // 前日のまま固定され、昨日のログが今日の日報になっていた）。
    // メモリ上のworkLogsは直近500件の窓しか無く、30秒間隔だと約4時間で
    // あふれて古いログが日報から静かに欠落するため、DBから今日ぶんを取り直す
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    let logsForToday: any[] = []
    if (user?.id) {
      const { data: rangeLogs, error: rangeError } = await getWorkLogsInRange(
        user.id,
        dayStart.toISOString(),
        dayEnd.toISOString(),
      )
      if (!rangeError && rangeLogs) {
        // 「全てクリア」済みのログはUI表示と同様に対象外にする
        let visible = rangeLogs
        try {
          const clearedAt = localStorage.getItem(`work_logs_cleared_at_${user.id}`)
          if (clearedAt) {
            const clearedTime = new Date(clearedAt).getTime()
            visible = rangeLogs.filter((log) => new Date(log.timestamp).getTime() > clearedTime)
          }
        } catch {
          /* localStorage不可の環境ではそのまま */
        }
        logsForToday = visible
      } else {
        console.warn("Range fetch for daily report failed; falling back to in-memory logs:", rangeError)
      }
    }
    if (logsForToday.length === 0) {
      // DB取得に失敗した場合のみ、従来どおりメモリ上の窓から抽出する
      const todayStr = new Date().toDateString()
      logsForToday = workLogs.filter(
        (log: any) => !log.report_type && new Date(log.timestamp).toDateString() === todayStr,
      )
    }
    if (logsForToday.length === 0) throw new Error("No logs today")

    // サーバー側は最終的に60件へ等間隔サンプリングするため、送信量だけ先に抑える
    // （30秒間隔のフル稼働日は数千件になり、POSTボディが無駄に数MB膨らむ）
    const MAX_UPLOAD_LOGS = 300
    if (logsForToday.length > MAX_UPLOAD_LOGS) {
      const stride = logsForToday.length / MAX_UPLOAD_LOGS
      logsForToday = Array.from({ length: MAX_UPLOAD_LOGS }, (_, i) => logsForToday[Math.floor(i * stride)])
    }

    const response = await fetch("/api/generate-daily-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workLogs: logsForToday,
        apiKey,
        date: new Date().toLocaleDateString("ja-JP"),
        // 利用者のタイムゾーンで日報の時刻を整形させる
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        // model は意図的に送らない（レポート系はサーバー既定の Gemma で枠を分離）
      }),
    })
    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const reportData = await response.json()

    const savedReport = await addWorkLog({
      user_id: user?.id || "",
      timestamp: new Date().toISOString(),
      activity: t('dr_cardTitle'),
      category: "neutral",
      details: reportData.summary,
      applications: [],
      report_type: "daily",
      report_data: {
        ...reportData,
        // 対象日と件数（日報カードの「対象」表示に使う）
        source_range: { from: dayStart.toISOString(), to: dayEnd.toISOString(), count: logsForToday.length },
      },
    })
    if (!savedReport) {
      // addWorkLogはネットワーク系エラーでthrowせずnullを返す。
      // ここでthrowしないとレポートが無言で消える（呼び出し元のcatchが表示を出す）
      throw new Error("Report save failed (network error)")
    }
  }, [workLogs, userSettings, addWorkLog, t])

  const reportsCount = useMemo(() => workLogs.filter((log: any) => !!log.report_type).length, [workLogs])
  const canGenerate = useMemo(() => workLogs.filter((log: any) => !log.report_type).length >= 3, [workLogs])
  const canGenerateDaily = todayRegularLogs.length > 0

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-orange-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">{t('page_checkingAuth')}</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    const handleSignIn = async () => {
      try {
        await signInWithGoogle()
      } catch (error) {
        console.error("Login error:", error)
        alert(t('page_loginError'))
      }
    }
    const GoogleIcon = () => (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    )
    return (
      <div className="min-h-screen bg-white">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md shadow-sm">
          <div className="container mx-auto flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <img src="/flownudge-logo.png" alt="FlowNudge" className="h-9 w-9 object-contain" />
              <span className="text-xl font-bold text-gray-900">FlowNudge</span>
            </div>
            <Button onClick={handleSignIn} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <GoogleIcon />
              Sign in with Google
            </Button>
          </div>
        </header>

        {/* ログイン失敗時のみ表示（成功時は何も出ないので通常の見た目は変わらない） */}
        {authError && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3">
            <div className="container mx-auto max-w-4xl text-sm text-red-800">
              <span className="font-semibold">ログインに失敗しました</span>
              <span className="ml-2 font-mono text-xs">[{authError.code}]</span>
              {authError.detail && <div className="mt-1 text-xs text-red-700">{authError.detail}</div>}
              <div className="mt-1 text-xs text-red-600">
                {authError.code === "no_code" || authError.code === "code_on_root"
                  ? `Supabase の Authentication → URL Configuration → Redirect URLs に ${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback を追加してください。`
                  : "ブラウザのCookieを削除して再度お試しください。解決しない場合は設定をご確認ください。"}
              </div>
            </div>
          </div>
        )}

        {/* Hero */}
        <section className="bg-gradient-to-br from-orange-50 via-white to-amber-50 py-24 px-6">
          <div className="container mx-auto max-w-4xl text-center">
            <img src="/flownudge-logo.png" alt="FlowNudge" className="h-24 w-24 object-contain mx-auto mb-6" />
            <h1 className="text-5xl font-bold text-gray-900 mb-4">FlowNudge</h1>
            <p className="text-2xl font-medium text-orange-600 mb-6">AI-Powered Focus & Productivity Tracking</p>
            <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              FlowNudge automatically monitors your screen activity, detects distractions using AI,
              and generates detailed productivity reports to help you stay focused and achieve deep work.
            </p>
            <Button onClick={handleSignIn} size="lg" className="bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 shadow-md text-base px-8 py-6 h-auto gap-3">
              <GoogleIcon />
              Get Started with Google
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="py-20 px-6 bg-white">
          <div className="container mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">How FlowNudge Works</h2>
            <p className="text-center text-gray-500 mb-14 text-lg">Four powerful features to maximize your productivity</p>
            <div className="grid md:grid-cols-2 gap-8">
              {[
                { Icon: Camera, title: "Automatic Screen Analysis", desc: "Captures your screen every 30 seconds and analyzes it with Gemini Vision using your own API key, identifying what you're working on in real time." },
                { Icon: Brain, title: "AI Distraction Detection", desc: "Gemini AI compares your screen activity with your planned task and alerts you instantly when you go off-track." },
                { Icon: TrendingUp, title: "Productivity Reports", desc: "Automatically generates consolidated reports every 3 sessions with focus scores, time distribution, and personalized improvement suggestions." },
                { Icon: Calendar, title: "Google Calendar Integration", desc: "Reads your Google Calendar (read-only) to display today's schedule and help you align your work sessions with your planned tasks." },
              ].map(({ Icon, title, desc }) => (
                <div key={title} className="flex gap-5 p-6 rounded-2xl border border-orange-100 bg-orange-50/50">
                  <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                    <p className="text-gray-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Google Data Usage */}
        <section className="py-20 px-6 bg-gray-50">
          <div className="container mx-auto max-w-3xl">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Shield className="h-7 w-7 text-orange-500" />
              <h2 className="text-3xl font-bold text-gray-900">How We Use Your Google Data</h2>
            </div>
            <p className="text-center text-gray-500 mb-12 text-lg">FlowNudge requests only the minimum permissions necessary</p>
            <div className="space-y-5">
              {[
                { title: "Google Account (name, email, profile photo)", desc: "Used solely for authentication and to display your account information in the app header. Never shared with third parties." },
                { title: "Google Calendar (read-only)", desc: "Used only to display today's schedule in the Time Tracker. FlowNudge never creates, modifies, or deletes calendar events. Calendar data is not stored externally." },
                { title: "Screen Capture (analyzed with your own API key)", desc: "Screenshots are captured only while analysis is running, resized in your browser, and sent to Google's Gemini API using your own API key. FlowNudge's servers never store the images — only the resulting text logs are saved to your account." },
              ].map(({ title, desc }) => (
                <div key={title} className="flex gap-4 p-5 rounded-xl bg-white border border-gray-200 shadow-sm">
                  <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-800 mb-1">{title}</p>
                    <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 px-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to boost your focus?</h2>
          <p className="text-orange-100 mb-8 text-lg">Sign in with your Google account to get started for free.</p>
          <Button onClick={handleSignIn} size="lg" className="bg-white text-orange-600 hover:bg-orange-50 text-base px-8 py-6 h-auto gap-3 font-semibold">
            <GoogleIcon />
            Sign in with Google
          </Button>
        </section>

        {/* Footer */}
        <footer className="border-t bg-white py-8 px-6">
          <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/flownudge-logo.png" alt="FlowNudge" className="h-6 w-6 object-contain" />
              <span className="text-sm font-medium text-gray-700">FlowNudge</span>
              <span className="text-sm text-gray-400">— AI-powered focus tracking</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="/privacy" className="hover:text-gray-600 hover:underline">{t('page_privacyPolicy')}</a>
              <span>·</span>
              <a href="/terms" className="hover:text-gray-600 hover:underline">{t('page_termsOfService')}</a>
            </div>
          </div>
          <div className="container mx-auto mt-4 text-center">
            <VersionBadge />
          </div>
        </footer>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-orange-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">{t('page_loadingData')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-slate-100">
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center">
              <img src="/flownudge-logo.png" alt="FlowNudge" className="h-10 w-10 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">FlowNudge</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 解析中インジケーター（他タブに移動しても継続していることを示す） */}
            {isScreenTracking && (
              <button
                type="button"
                onClick={() => setCurrentTab("logs")}
                className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                title={t('page_trackingBadgeHint')}
              >
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                {t('page_trackingBadge')}
              </button>
            )}

            {/* ユーザー情報（Google審査用：取得データの表示） */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name || user.email || ""}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                  {(user?.name || user?.email || "?")[0].toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block">
                {user?.name && (
                  <p className="text-xs font-medium text-gray-800 leading-tight">{user.name}</p>
                )}
                <p className="text-xs text-gray-500 leading-tight">{user?.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => openSettings("gemini")} className="gap-2">
              <Settings className="h-4 w-4" />
              {t('page_settings')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2 bg-transparent">
              <LogOut className="h-4 w-4" />
              {t('page_logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
          <TabsList className="bg-white/80 backdrop-blur-sm border shadow-sm">
            <TabsTrigger value="logs" className="gap-2">
              <Activity className="h-4 w-4" />
              {t('page_tabLogs')}
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <FileText className="h-4 w-4" />
              {t('page_tabReports')}
              {reportsCount > 0 && (
                <span className="ml-1 rounded-full bg-orange-500 px-2 py-0.5 text-xs text-white">{reportsCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('page_tabBreakdown')}
            </TabsTrigger>
          </TabsList>

          {/* forceMount + CSSで非表示にすることで、他タブに移動しても
              画面共有ストリームと自動キャプチャのタイマーが止まらないようにする
              （TabsContentは既定で非アクティブ時にアンマウントされ、
                useScreenCaptureのクリーンアップがストリームを停止してしまう） */}
          <TabsContent value="logs" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
              {/* 左側: タイムトラッカー */}
              <div>
                <TimeTracker
                  onTimeEntryChange={() => {}}
                  onCurrentTaskChange={setCurrentTask}
                  timeEntries={timeEntries}
                  screenSessions={screenSessions}
                  togglApiToken={togglApiToken}
                  togglWorkspaceId={togglWorkspaceId}
                  togglCredentialsLocalOnly={togglCredentialsLocalOnly}
                  onOpenTogglSettings={() => openSettings("toggl")}
                />
              </div>

              {/* 右側: 作業ログパネル */}
              <div>
                <WorkLogPanel
                  currentTask={currentTask}
                  apiKey={userSettings?.gemini_api_key || ""}
                  model={userSettings?.gemini_model || "gemini-3.5-flash-lite"}
                  captureInterval={userSettings?.capture_interval || DEFAULT_CAPTURE_INTERVAL_SECONDS}
                  workLogs={workLogs as any}
                  categories={categories}
                  addWorkLog={addWorkLog}
                  clearWorkLogs={clearWorkLogs}
                  onTrackingChange={handleTrackingChange}
                  onOpenReports={() => setCurrentTab("reports")}
                  nudgePreferences={nudgePreferences}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reports">
            <ReportsTab
              workLogs={workLogs}
              userId={user?.id || ""}
              onRefresh={refreshData}
              onGenerateReport={handleGenerateReport}
              canGenerate={canGenerate}
              onGenerateDailyReport={handleGenerateDailyReport}
              canGenerateDaily={canGenerateDaily}
            />
          </TabsContent>

          <TabsContent value="breakdown">
            <ActivityBreakdown
              userId={user?.id || ""}
              categories={categories}
              captureInterval={userSettings?.capture_interval || DEFAULT_CAPTURE_INTERVAL_SECONDS}
              onCategoriesChange={handleCategoriesChange}
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPanel
              onClose={() => setCurrentTab("logs")}
              initialTab={settingsInitialTab}
              apiKey={userSettings?.gemini_api_key || ""}
              model={userSettings?.gemini_model || "gemini-3.5-flash-lite"}
              captureInterval={userSettings?.capture_interval || DEFAULT_CAPTURE_INTERVAL_SECONDS}
              togglApiToken={togglApiToken}
              togglWorkspaceId={togglWorkspaceId}
              togglCredentialsLocalOnly={togglCredentialsLocalOnly}
              onApiKeyChange={handleApiKeyChange}
              onModelChange={async (model) => {
                await updateSettings({ gemini_model: model })
              }}
              onCaptureIntervalChange={async (interval) => {
                await updateSettings({ capture_interval: interval })
              }}
              nudgePreferences={nudgePreferences}
              onNudgePreferencesChange={async (prefs) => {
                await updateSettings({ nudge_preferences: prefs })
              }}
              onTogglCredentialsChange={handleTogglCredentialsChange}
              projects={projects}
              addProject={addProject}
              editProject={editProject}
              removeProject={removeProject}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* ビルド情報（どのデプロイを見ているかの確認用） */}
      <footer className="border-t bg-white/60 py-4">
        <div className="container mx-auto px-4 text-center">
          <VersionBadge />
        </div>
      </footer>
    </div>
  )
}

export default Page
