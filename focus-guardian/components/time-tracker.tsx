"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, Square, Clock, Trash2, RefreshCw, Loader2, Calendar, ChevronDown, ChevronUp, ToggleLeft, Monitor } from "lucide-react"
import { useGoogleCalendar, getEventColor } from "@/hooks/use-google-calendar"

interface TimeEntry {
  id: string
  projectId: string
  description: string
  startTime: Date
  endTime?: Date
  duration: number // seconds
  tags: string[]
}

interface ScreenSession {
  id: string
  startTime: Date
  endTime?: Date
  task: string
}

interface TimeTrackerProps {
  onTimeEntryChange: (entry: TimeEntry | null) => void
  onCurrentTaskChange: (task: string) => void
  timeEntries: any[]
  screenSessions?: ScreenSession[]
  togglApiToken?: string
  togglWorkspaceId?: string
}

type TaskSource = "calendar" | "toggl"

export function TimeTracker({
  onTimeEntryChange,
  onCurrentTaskChange,
  timeEntries,
  screenSessions = [],
  togglApiToken = "",
  togglWorkspaceId = "",
}: TimeTrackerProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [description, setDescription] = useState("")
  const [selectedEventColor, setSelectedEventColor] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [taskSource, setTaskSource] = useState<TaskSource>("calendar")
  const [togglEntries, setTogglEntries] = useState<Array<{ description: string; project: string | null; is_running: boolean }>>([])
  const [togglLoading, setTogglLoading] = useState(false)
  const [togglError, setTogglError] = useState<string | null>(null)
  const [showToggl, setShowToggl] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

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

  // 現在のタスクを親コンポーネントに通知
  useEffect(() => {
    if (currentEntry) {
      onCurrentTaskChange(currentEntry.description)
    } else {
      onCurrentTaskChange(description)
    }
  }, [currentEntry, description, onCurrentTaskChange])

  const fetchTogglEntries = useCallback(async () => {
    if (!togglApiToken || !togglWorkspaceId) {
      setTogglError("Togglのトークンとワークスペースが設定されていません。設定画面から入力してください。")
      return
    }
    setTogglLoading(true)
    setTogglError(null)
    try {
      const res = await fetch(`/api/toggl-current?apiToken=${encodeURIComponent(togglApiToken)}&workspaceId=${encodeURIComponent(togglWorkspaceId)}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        setTogglError(data.error || "Togglの取得に失敗しました")
        return
      }
      if (data.description) {
        setTogglEntries([{ description: data.description, project: data.project, is_running: data.is_running }])
      } else {
        setTogglEntries([])
      }
    } catch {
      setTogglError("Togglの取得に失敗しました")
    } finally {
      setTogglLoading(false)
    }
  }, [togglApiToken, togglWorkspaceId])

  const saveToStorage = (entries: TimeEntry[]) => {
    localStorage.setItem("time_entries", JSON.stringify(entries))
  }

  const startTimer = () => {
    const taskDescription = description || "作業中..."

    const newEntry: TimeEntry = {
      id: Date.now().toString(),
      projectId: "",
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

  const deleteEntry = (entryId: string) => {
    const newEntries = timeEntries.filter((entry) => entry.id !== entryId)
    saveToStorage(newEntries)
  }

  const getTodayScreenSessions = () => {
    const today = new Date().toDateString()
    return screenSessions.filter((s) => s.startTime.toDateString() === today)
  }

  const todayEntries = getTodayEntries()
  const todayScreenSessions = getTodayScreenSessions()

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
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                {selectedEventColor && (
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedEventColor }} />
                )}
                <div className="text-xs text-gray-500">{currentEntry.description}</div>
              </div>
            )}
          </div>

          {/* タスクソース切り替え */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setTaskSource("calendar")}
              disabled={isRunning}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                taskSource === "calendar"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Googleカレンダー
            </button>
            <button
              onClick={() => setTaskSource("toggl")}
              disabled={isRunning}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                taskSource === "toggl"
                  ? "bg-orange-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <ToggleLeft className="h-4 w-4" />
              Toggl
            </button>
          </div>

          {/* Googleカレンダー連携 */}
          {taskSource === "calendar" && (
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
                  カレンダーから作業内容を選択
                </span>
                {showCalendar ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>

              {selectedEventColor && description && !showCalendar && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm" style={{ borderColor: selectedEventColor, backgroundColor: `${selectedEventColor}15` }}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedEventColor }} />
                  <span className="truncate text-gray-700">{description}</span>
                </div>
              )}

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

                  {events.map((event) => {
                    const color = getEventColor(event.colorId)
                    return (
                      <button
                        key={event.id}
                        onClick={() => {
                          setDescription(event.summary)
                          setSelectedEventColor(color)
                          setShowCalendar(false)
                        }}
                        className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                          isEventNow(event)
                            ? "bg-green-200 border border-green-400 text-green-900 font-medium"
                            : "bg-white border border-gray-200 text-gray-700 hover:bg-green-100 hover:border-green-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="font-medium truncate">{event.summary}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 ml-4">{formatEventTime(event)}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Toggl連携 */}
          {taskSource === "toggl" && (
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!showToggl) {
                    setShowToggl(true)
                    await fetchTogglEntries()
                  } else {
                    setShowToggl(false)
                  }
                }}
                disabled={isRunning}
                className="w-full flex items-center justify-between gap-2 border-orange-200 text-orange-700 hover:bg-orange-50"
              >
                <span className="flex items-center gap-2">
                  <ToggleLeft className="h-4 w-4" />
                  Togglから作業内容を選択
                </span>
                {showToggl ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>

              {!selectedEventColor && description && !showToggl && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-orange-200 bg-orange-50 text-sm">
                  <ToggleLeft className="h-3 w-3 text-orange-500 flex-shrink-0" />
                  <span className="truncate text-gray-700">{description}</span>
                </div>
              )}

              {showToggl && (
                <div className="border border-orange-100 rounded-lg p-3 bg-orange-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-orange-800">Togglのエントリ</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchTogglEntries}
                      disabled={togglLoading}
                      className="h-6 px-2 text-xs text-orange-700 hover:bg-orange-100"
                    >
                      {togglLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                  </div>

                  {togglError && (
                    <div className="text-xs text-red-600 bg-red-50 rounded p-2">{togglError}</div>
                  )}

                  {!togglLoading && !togglError && togglEntries.length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-2">Togglのエントリが見つかりません</div>
                  )}

                  {togglEntries.map((entry, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setDescription(entry.description)
                        setSelectedEventColor(null)
                        setShowToggl(false)
                      }}
                      className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors border ${
                        entry.is_running
                          ? "bg-orange-200 border-orange-400 text-orange-900 font-medium"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-orange-100 hover:border-orange-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {entry.is_running && <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />}
                        <span className="truncate">{entry.description}</span>
                      </div>
                      {entry.project && (
                        <div className="text-xs text-gray-500 mt-0.5 ml-4">{entry.project}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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

      {/* 今日のタイムエントリ（手動） */}
      {todayEntries.length > 0 && (
        <Card className="shadow-md border border-gray-200">
          <CardHeader className="pb-3 bg-white border-b border-gray-100">
            <CardTitle className="text-lg text-gray-800">今日のタイムエントリ</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {todayEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
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
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 画面共有セッション */}
      <Card className="shadow-md border border-gray-200">
        <CardHeader className="pb-3 bg-white border-b border-gray-100">
          <CardTitle className="flex items-center gap-2 text-lg text-gray-800">
            <Monitor className="h-4 w-4 text-blue-500" />
            画面共有セッション
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {todayScreenSessions.map((session) => {
              const duration = session.endTime
                ? Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000)
                : null
              return (
                <div key={session.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex-1">
                    {session.task && (
                      <div className="text-sm font-medium text-gray-700 mb-0.5">{session.task}</div>
                    )}
                    <div className="text-xs text-gray-500">
                      {formatTime(session.startTime)}
                      {session.endTime ? ` - ${formatTime(session.endTime)}` : " - 計測中..."}
                    </div>
                  </div>
                  {duration !== null && (
                    <Badge variant="outline" className="font-mono border-blue-200 text-blue-700">
                      {formatDuration(duration)}
                    </Badge>
                  )}
                </div>
              )
            })}
            {todayScreenSessions.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                画面共有を開始するとセッションが記録されます
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
