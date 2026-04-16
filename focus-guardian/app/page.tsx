"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { supabase, signInWithGoogle } from "@/lib/supabase"
import { useSupabaseData } from "@/hooks/use-supabase-data"
import { TimeTracker } from "@/components/time-tracker"
import { WorkLogPanel } from "@/components/work-log-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { ReportsTab } from "@/components/reports-tab"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Settings, LogOut, Activity, FileText, BarChart3 } from "lucide-react"
import { ActivityBreakdown, DEFAULT_CATEGORIES, type ActivityCategory } from "@/components/activity-breakdown"

const Page = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const isLoggedInRef = useRef(false)
  const [currentTask, setCurrentTask] = useState("")
  const [currentTab, setCurrentTab] = useState("logs")
  const [screenSessions, setScreenSessions] = useState<Array<{ id: string; startTime: Date; endTime?: Date; task: string }>>([])
  const screenSessionStartRef = useRef<{ time: Date; task: string } | null>(null)
  const togglApiToken = typeof window !== "undefined" ? localStorage.getItem("toggl_api_token") || "" : ""
  const togglWorkspaceId = typeof window !== "undefined" ? localStorage.getItem("toggl_workspace_id") || "" : ""
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

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
  }, [])

  const reportsCount = useMemo(() => workLogs.filter((log: any) => log.report_type === "summary").length, [workLogs])

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">認証状態を確認中...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold">FocusGuardian</CardTitle>
            <CardDescription>
              思考の脱線検知システムのベータテストページです。
              <br />
              Googleアカウントでログインして続けてください。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={async () => {
                try {
                  await signInWithGoogle()
                } catch (error) {
                  console.error("Login error:", error)
                  alert("ログインに失敗しました。もう一度お試しください。")
                }
              }}
              className="w-full bg-white text-gray-800 hover:bg-gray-50 border border-gray-300 shadow-sm"
              size="lg"
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Googleでログイン
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">データを読み込み中...</p>
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">FocusGuardian</h1>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentTab("settings")} className="gap-2">
              <Settings className="h-4 w-4" />
              設定
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2 bg-transparent">
              <LogOut className="h-4 w-4" />
              ログアウト
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
          <TabsList className="bg-white/80 backdrop-blur-sm border shadow-sm">
            <TabsTrigger value="logs" className="gap-2">
              <Activity className="h-4 w-4" />
              作業ログ
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <FileText className="h-4 w-4" />
              レポート
              {reportsCount > 0 && (
                <span className="ml-1 rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">{reportsCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              作業内訳
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-4">
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
                />
              </div>

              {/* 右側: 作業ログパネル */}
              <div>
                <WorkLogPanel
                  currentTask={currentTask}
                  apiKey={userSettings?.gemini_api_key || ""}
                  model={userSettings?.gemini_model || "gemini-2.5-flash-lite"}
                  captureInterval={userSettings?.capture_interval || 30}
                  workLogs={workLogs as any}
                  categories={categories}
                  addWorkLog={addWorkLog}
                  clearWorkLogs={clearWorkLogs}
                  onTrackingChange={handleTrackingChange}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="reports">
            <ReportsTab
              workLogs={workLogs}
              userId={user?.id || ""}
              onRefresh={refreshData}
            />
          </TabsContent>

          <TabsContent value="breakdown">
            <ActivityBreakdown
              workLogs={workLogs as any}
              categories={categories}
              captureInterval={userSettings?.capture_interval || 30}
              onCategoriesChange={handleCategoriesChange}
            />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPanel
              onClose={() => setCurrentTab("logs")}
              apiKey={userSettings?.gemini_api_key || ""}
              model={userSettings?.gemini_model || "gemini-2.5-flash-lite"}
              captureInterval={userSettings?.capture_interval || 30}
              togglApiToken={userSettings?.toggl_api_token || ""}
              togglWorkspaceId={userSettings?.toggl_workspace_id || ""}
              onApiKeyChange={handleApiKeyChange}
              onModelChange={async (model) => {
                await updateSettings({ gemini_model: model })
              }}
              onCaptureIntervalChange={async (interval) => {
                await updateSettings({ capture_interval: interval })
              }}
              onTogglCredentialsChange={async (token, workspaceId) => {
                await updateSettings({ toggl_api_token: token, toggl_workspace_id: workspaceId })
              }}
              projects={projects}
              addProject={addProject}
              editProject={editProject}
              removeProject={removeProject}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default Page
