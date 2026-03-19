"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Play, Pause, Square, Clock, Trash2, RefreshCw, Loader2, Download, CheckCircle, Calendar, ChevronDown, ChevronUp } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useGoogleCalendar } from "@/hooks/use-google-calendar"

interface Project {
  id: string
  name: string
  color: string
  client?: string
}

interface TimeEntry {
  id: string
  projectId: string
  description: string
  startTime: Date
  endTime?: Date
  duration: number // seconds
  tags: string[]
}

interface TimeTrackerProps {
  onTimeEntryChange: (entry: TimeEntry | null) => void
  onCurrentTaskChange: (task: string) => void
  togglSyncInterval: number
  onProjectsSync: (projects: Project[]) => void
  projects: Project[]
  timeEntries: any[]
  addTimeEntry: (entry: any) => Promise<any>
  editTimeEntry: (id: string, updates: any) => Promise<any>
  removeTimeEntry: (id: string) => Promise<any>
}

export function TimeTracker({
  onTimeEntryChange,
  onCurrentTaskChange,
  togglSyncInterval,
  onProjectsSync,
  projects,
  timeEntries,
  addTimeEntry,
  editTimeEntry,
  removeTimeEntry,
}: TimeTrackerProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isTogglConfigured, setIsTogglConfigured] = useState(false)
  const [isSyncingToggl, setIsSyncingToggl] = useState(false)
  const [autoSyncToggl, setAutoSyncToggl] = useState(false)
  const [isSyncingProjects, setIsSyncingProjects] = useState(false)
  const [description, setDescription] = useState("")
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [syncMessage, setSyncMessage] = useState<{ text: string; success: boolean } | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const togglSyncIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const { events, loading: calendarLoading, error: calendarError, needsReauth, fetchTodayEvents, formatEventTime, isEventNow } = useGoogleCalendar()

  // タイマー更新
  useEffect(() => {
    if (isRunning && currentEntry) {
      intervalRef.current = setInterval(() => {
        const now = new Date()
        const elapsed = Math.floor((now.getTime() - currentEntry.startTime.getTime()) / 1000)
        setCurrentTime(elapsed)
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning, currentEntry])

  // 現在のタスクを親コンポーネントに通知（空でも通知）
  useEffect(() => {
    if (currentEntry) {
      onCurrentTaskChange(currentEntry.description)
    } else {
      onCurrentTaskChange(description)
    }
  }, [currentEntry, description, onCurrentTaskChange])

  // Toggl設定状況を確認
  useEffect(() => {
    const checkTogglConfig = async () => {
      try {
        const hasLocalCredentials = !!(
          localStorage.getItem("toggl_api_token") && localStorage.getItem("toggl_workspace_id")
        )

        if (hasLocalCredentials) {
          setIsTogglConfigured(true)
          return
        }

        const response = await fetch("/api/toggl/status")
        const data = await response.json()
        setIsTogglConfigured(data.configured)
      } catch (error) {
        console.error("Failed to check Toggl config:", error)
        const hasLocalCredentials = !!(
          localStorage.getItem("toggl_api_token") && localStorage.getItem("toggl_workspace_id")
        )
        setIsTogglConfigured(hasLocalCredentials)
      }
    }

    checkTogglConfig()
  }, [])

  // Set up auto-sync with Toggl if enabled
  useEffect(() => {
    if (autoSyncToggl && isTogglConfigured) {
      syncWithToggl()

      togglSyncIntervalRef.current = setInterval(() => {
        syncWithToggl()
      }, togglSyncInterval * 1000)
    } else if (togglSyncIntervalRef.current) {
      clearInterval(togglSyncIntervalRef.current)
      togglSyncIntervalRef.current = null
    }

    return () => {
      if (togglSyncIntervalRef.current) {
        clearInterval(togglSyncIntervalRef.current)
      }
    }
  }, [autoSyncToggl, isTogglConfigured, togglSyncInterval])

  useEffect(() => {
    const savedEntries = localStorage.getItem("time_entries")
    if (savedEntries) {
      const entries = JSON.parse(savedEntries).map((entry: any) => ({
        ...entry,
        startTime: new Date(entry.startTime),
        endTime: entry.endTime ? new Date(entry.endTime) : undefined,
      }))
    }
  }, [])

  const saveToStorage = (entries: TimeEntry[]) => {
    localStorage.setItem("time_entries", JSON.stringify(entries))
  }

  const getProjectColor = (index: number) => {
    const colors = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#f97316",
      "#84cc16",
      "#ec4899",
      "#6b7280",
    ]
    return colors[index % colors.length]
  }

  const syncTogglProjects = async () => {
    if (!isTogglConfigured) {
      setSyncMessage({
        text: "Toggl連携が設定されていません。設定画面でAPIトークンとワークスペースIDを設定してください。",
        success: false,
      })
      setTimeout(() => setSyncMessage(null), 5000)
      return
    }

    setIsSyncingProjects(true)
    setSyncMessage(null)

    try {
      const apiToken = localStorage.getItem("toggl_api_token")
      const workspaceId = localStorage.getItem("toggl_workspace_id")

      if (!apiToken || !workspaceId) {
        throw new Error("Toggl APIトークンまたはワークスペースIDが設定されていません。")
      }

      console.log("🔄 Syncing Toggl projects...", { workspaceId })

      const auth = btoa(`${apiToken}:api_token`)
      const response = await fetch(`https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/projects`, {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Toggl projects sync error:", errorText)
        throw new Error(`Togglプロジェクトの取得に失敗しました (${response.status})`)
      }

      const togglProjects = await response.json()
      console.log("✅ Toggl projects fetched:", togglProjects)

      if (!Array.isArray(togglProjects) || togglProjects.length === 0) {
        setSyncMessage({
          text: "Togglにプロジェクトが見つかりませんでした。",
          success: false,
        })
        setTimeout(() => setSyncMessage(null), 5000)
        return
      }

      const convertedProjects: Project[] = togglProjects.map((project: any, index: number) => ({
        id: `toggl-${project.id}`,
        name: project.name,
        color: project.color || getProjectColor(index),
        client: project.client_name || "Toggl",
      }))

      console.log("📊 Converted projects:", convertedProjects)

      const existingProjectNames = projects.map((p) => p.name.toLowerCase())
      const newProjects = convertedProjects.filter((p) => !existingProjectNames.includes(p.name.toLowerCase()))

      console.log("🆕 New projects to add:", newProjects)

      if (newProjects.length > 0) {
        onProjectsSync(newProjects)
        setSyncMessage({
          text: `${newProjects.length}件のTogglプロジェクトを同期しました。`,
          success: true,
        })
      } else {
        setSyncMessage({
          text: "新しいプロジェクトはありませんでした。すべて同期済みです。",
          success: true,
        })
      }

      setTimeout(() => setSyncMessage(null), 5000)
    } catch (error) {
      console.error("❌ Toggl projects sync error:", error)
      setSyncMessage({
        text: error instanceof Error ? error.message : "プロジェクト同期中にエラーが発生しました",
        success: false,
      })
      setTimeout(() => setSyncMessage(null), 5000)
    } finally {
      setIsSyncingProjects(false)
    }
  }

  const syncWithToggl = async () => {
    if (!isTogglConfigured) return

    setIsSyncingToggl(true)
    setSyncMessage(null)

    try {
      const apiToken = localStorage.getItem("toggl_api_token")
      const workspaceId = localStorage.getItem("toggl_workspace_id")

      if (!apiToken || !workspaceId) {
        throw new Error("Toggl APIトークンまたはワークスペースIDが設定されていません。")
      }

      console.log("🔄 Syncing with Toggl...")

      let url = "/api/toggl-current"
      url += `?apiToken=${encodeURIComponent(apiToken)}&workspaceId=${encodeURIComponent(workspaceId)}`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Toggl API error: ${response.status}`)
      }

      const data = await response.json()
      console.log("📊 Toggl response:", data)

      if (data.error) {
        throw new Error(data.error)
      }

      // プロジェクト情報の処理
      let matchedProjectId = selectedProjectId

      if (data.project && data.project_id) {
        console.log("🔍 Processing project:", data.project)

        // 既存プロジェクトから検索（完全一致または部分一致）
        let matchingProject = projects.find(
          (p) =>
            p.name.toLowerCase() === data.project.toLowerCase() ||
            p.name.toLowerCase().includes(data.project.toLowerCase()) ||
            data.project.toLowerCase().includes(p.name.toLowerCase()),
        )

        // Toggl IDでの検索も試行
        if (!matchingProject) {
          matchingProject = projects.find((p) => p.id === `toggl-${data.project_id}`)
        }

        if (matchingProject) {
          console.log("✅ Found existing project:", matchingProject.name)
          matchedProjectId = matchingProject.id
          setSelectedProjectId(matchingProject.id)
        } else {
          // プロジェクトが見つからない場合、新規追加
          console.log("➕ Adding new project from Toggl:", data.project)

          const newProject: Project = {
            id: `toggl-${data.project_id}`,
            name: data.project,
            color: getProjectColor(projects.length),
            client: "Toggl",
          }

          // プロジェクトを追加
          onProjectsSync([newProject])

          // 状態を更新
          matchedProjectId = newProject.id

          // 少し待ってから選択状態を更新
          setTimeout(() => {
            setSelectedProjectId(newProject.id)
            console.log("✅ New project added and selected:", newProject.name)
          }, 100)
        }
      }

      // 作業内容の更新
      if (data.description) {
        console.log("📝 Updating description:", data.description)
        setDescription(data.description)
      }

      // タイマーの同期
      if (data.is_running && data.start) {
        console.log("▶️ Toggl timer is running")

        // 既存のタイマーを停止
        if (isRunning && currentEntry) {
          console.log("⏸️ Stopping existing timer before sync")
          pauseTimer()
        }

        // Togglのタイマーを反映
        setTimeout(() => {
          const startTime = new Date(data.start)
          const newEntry: TimeEntry = {
            id: `toggl-${data.entry_id || Date.now()}`,
            projectId: matchedProjectId,
            description: data.description || "作業中...",
            startTime: startTime,
            duration: 0,
            tags: [],
          }

          console.log("▶️ Starting timer with Toggl data:", newEntry)
          setCurrentEntry(newEntry)
          setIsRunning(true)
          onTimeEntryChange(newEntry)

          setSyncMessage({
            text: `Togglと同期しました: ${data.project || "プロジェクト"} - ${data.description || "作業中"}`,
            success: true,
          })
          setTimeout(() => setSyncMessage(null), 5000)
        }, 200)
      } else {
        console.log("⏹️ Toggl timer is not running")
        setSyncMessage({
          text: "Togglのタイマーは停止中です。作業内容のみ同期しました。",
          success: true,
        })
        setTimeout(() => setSyncMessage(null), 5000)
      }
    } catch (error) {
      console.error("❌ Toggl sync error:", error)
      setSyncMessage({
        text: error instanceof Error ? error.message : "Toggl同期中にエラーが発生しました",
        success: false,
      })
      setTimeout(() => setSyncMessage(null), 5000)
    } finally {
      setIsSyncingToggl(false)
    }
  }

  const startTimer = () => {
    const taskDescription = description || "作業中..."

    const newEntry: TimeEntry = {
      id: Date.now().toString(),
      projectId: selectedProjectId,
      description: taskDescription,
      startTime: new Date(),
      duration: 0,
      tags: [],
    }

    setCurrentEntry(newEntry)
    setIsRunning(true)
    setCurrentTime(0)
    onTimeEntryChange(newEntry)
  }

  const pauseTimer = () => {
    if (currentEntry) {
      const now = new Date()
      const duration = Math.floor((now.getTime() - currentEntry.startTime.getTime()) / 1000)

      const updatedEntry: TimeEntry = {
        ...currentEntry,
        endTime: now,
        duration,
      }

      const newEntries = [updatedEntry, ...timeEntries]
      saveToStorage(newEntries)
    }

    setCurrentEntry(null)
    setIsRunning(false)
    setCurrentTime(0)
    onTimeEntryChange(null)
  }

  const stopTimer = () => {
    pauseTimer()
    setDescription("")
  }

  const toggleAutoSync = () => {
    setAutoSyncToggl(!autoSyncToggl)
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getTodayEntries = () => {
    const today = new Date().toDateString()
    return timeEntries.filter((entry) => entry.startTime.toDateString() === today)
  }

  const getTodayTotal = () => {
    return getTodayEntries().reduce((total, entry) => total + entry.duration, 0)
  }

  const getProjectById = (id: string) => {
    return projects.find((p) => p.id === id)
  }

  const deleteEntry = (entryId: string) => {
    const newEntries = timeEntries.filter((entry) => entry.id !== entryId)
    saveToStorage(newEntries)
  }

  const todayEntries = getTodayEntries()
  const todayTotal = getTodayTotal()

  return (
    <div className="space-y-4">
      {/* タイマー */}
      <Card className="shadow-md border border-gray-200">
        <CardHeader className="pb-3 bg-white border-b border-gray-100">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <Clock className="h-5 w-5 text-blue-600" />
            タイムトラッカー
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {/* 現在のタイマー表示 */}
          <div className="text-center py-6 bg-gradient-to-b from-blue-50 to-white rounded-lg border border-blue-100">
            <div className="text-6xl font-mono font-bold text-blue-600 mb-3">{formatDuration(currentTime)}</div>
            {currentEntry && (
              <div className="text-sm text-gray-600">
                <div className="font-medium text-gray-800">{getProjectById(currentEntry.projectId)?.name}</div>
                <div className="text-xs text-gray-500 mt-1">{currentEntry.description}</div>
              </div>
            )}
          </div>

          {/* Toggl同期ボタン - 2行レイアウト */}
          {isTogglConfigured && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncWithToggl}
                  disabled={isSyncingToggl}
                  className="flex items-center justify-center gap-2 text-sm h-10 bg-transparent"
                >
                  {isSyncingToggl ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Togglと同期
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncTogglProjects}
                  disabled={isSyncingProjects}
                  className="flex items-center justify-center gap-2 text-sm h-10 bg-transparent"
                >
                  {isSyncingProjects ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  プロジェクト同期
                </Button>
              </div>
              <Button
                variant={autoSyncToggl ? "default" : "outline"}
                size="sm"
                onClick={toggleAutoSync}
                className="w-full flex items-center justify-center text-sm h-10"
              >
                自動同期{autoSyncToggl ? "ON" : "OFF"}
              </Button>
            </div>
          )}

          {/* 同期メッセージ */}
          {syncMessage && (
            <Alert className={syncMessage.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <CheckCircle className={`h-4 w-4 ${syncMessage.success ? "text-green-600" : "text-red-600"}`} />
              <AlertDescription className={syncMessage.success ? "text-green-800" : "text-red-800"}>
                {syncMessage.text}
              </AlertDescription>
            </Alert>
          )}

          {/* プロジェクト選択 */}
          <div className="space-y-2">
            <Label htmlFor="project">プロジェクト</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId} disabled={isRunning}>
              <SelectTrigger>
                <SelectValue placeholder="プロジェクトを選択" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                      {project.name}
                      {project.client && <span className="text-xs text-gray-500">({project.client})</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Googleカレンダー連携 */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!showCalendar) {
                  setShowCalendar(true)
                  if (events.length === 0) await fetchTodayEvents()
                } else {
                  setShowCalendar(false)
                }
              }}
              disabled={isRunning}
              className="w-full flex items-center justify-between gap-2 border-green-200 text-green-700 hover:bg-green-50"
            >
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Googleカレンダーから作業内容を選択
              </span>
              {showCalendar ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showCalendar && (
              <div className="border border-green-100 rounded-lg p-3 bg-green-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-green-800">今日の予定</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchTodayEvents}
                    disabled={calendarLoading}
                    className="h-6 px-2 text-xs text-green-700 hover:bg-green-100"
                  >
                    {calendarLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </Button>
                </div>

                {calendarError && (
                  <div className="text-xs text-red-600 bg-red-50 rounded p-2">
                    {calendarError}
                    {needsReauth && (
                      <div className="mt-1 text-xs text-gray-500">
                        ※ 一度ログアウトして再度Googleでログインしてください
                      </div>
                    )}
                  </div>
                )}

                {!calendarLoading && !calendarError && events.length === 0 && (
                  <div className="text-xs text-gray-500 text-center py-2">今日の予定はありません</div>
                )}

                {events.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => {
                      setDescription(event.summary)
                      setShowCalendar(false)
                    }}
                    className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                      isEventNow(event)
                        ? "bg-green-200 border border-green-400 text-green-900 font-medium"
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-green-100 hover:border-green-300"
                    }`}
                  >
                    <div className="font-medium truncate">{event.summary}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{formatEventTime(event)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 作業内容 */}
          <div className="space-y-2">
            <Label htmlFor="description" className="flex items-center gap-2">
              作業内容
              <span className="text-xs text-gray-500">(任意 - 脱線判定の精度向上に役立ちます)</span>
            </Label>
            <Input
              id="description"
              placeholder="具体的な作業内容を入力すると、より正確な脱線判定が可能です"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isRunning}
              className={isRunning ? "bg-blue-50 border-blue-200" : ""}
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
            />
            <div className="text-xs text-gray-500">
              💡 入力すると画面解析結果と比較して脱線を自動判定します（未入力でも解析は実行されます）
            </div>
          </div>

          {/* コントロールボタン */}
          <div className="flex gap-2">
            {!isRunning ? (
              <Button
                onClick={startTimer}
                className="flex-1 flex items-center justify-center gap-2 h-11 bg-black hover:bg-gray-800"
              >
                <Play className="h-4 w-4" />
                開始
              </Button>
            ) : (
              <>
                <Button
                  onClick={pauseTimer}
                  variant="outline"
                  className="flex-1 flex items-center justify-center gap-2 h-11 bg-transparent"
                >
                  <Pause className="h-4 w-4" />
                  一時停止
                </Button>
                <Button
                  onClick={stopTimer}
                  variant="destructive"
                  className="flex-1 flex items-center justify-center gap-2 h-11"
                >
                  <Square className="h-4 w-4" />
                  停止
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 今日の統計 */}
      <Card className="shadow-md border border-gray-200">
        <CardHeader className="pb-3 bg-white border-b border-gray-100">
          <CardTitle className="text-lg text-gray-800">今日の作業時間</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="text-center py-4">
            <div className="text-3xl font-bold text-green-600 mb-2">{formatDuration(todayTotal)}</div>
            <div className="text-sm text-gray-600">{todayEntries.length}件のタスク</div>
          </div>

          {/* プロジェクト別統計 */}
          <div className="mt-4 space-y-2">
            {projects.map((project) => {
              const projectEntries = todayEntries.filter((entry) => entry.projectId === project.id)
              const projectTotal = projectEntries.reduce((total, entry) => total + entry.duration, 0)

              if (projectTotal === 0) return null

              return (
                <div key={project.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                    <span className="text-sm">{project.name}</span>
                  </div>
                  <span className="text-sm font-medium">{formatDuration(projectTotal)}</span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 今日のタイムエントリ */}
      <Card className="shadow-md border border-gray-200">
        <CardHeader className="pb-3 bg-white border-b border-gray-100">
          <CardTitle className="text-lg text-gray-800">今日のタイムエントリ</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {todayEntries.map((entry) => {
              const project = getProjectById(entry.projectId)
              return (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project?.color }} />
                      <span className="font-medium text-sm">{project?.name}</span>
                    </div>
                    <div className="text-sm text-gray-600">{entry.description}</div>
                    <div className="text-xs text-gray-500">
                      {formatTime(entry.startTime)}
                      {entry.endTime && ` - ${formatTime(entry.endTime)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {formatDuration(entry.duration)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteEntry(entry.id)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
            {todayEntries.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">まだタイムエントリがありません</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
