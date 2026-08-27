"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Play, Pause, Square, Clock, Trash2, RefreshCw, Loader2, Calendar, ChevronDown, ChevronUp, ToggleLeft, Monitor, Settings } from "lucide-react"
import { useGoogleCalendar, getEventColor } from "@/hooks/use-google-calendar"
import { useTranslation } from "@/lib/i18n"

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
  /** 資格情報がDBに無くこの端末だけにある状態（サーバーが解決できないため送る必要がある） */
  togglCredentialsLocalOnly?: boolean
  /** Toggl設定画面を開く（未設定のときの導線） */
  onOpenTogglSettings?: () => void
}

type TaskSource = "calendar" | "toggl"

export function TimeTracker({
  onTimeEntryChange,
  onCurrentTaskChange,
  timeEntries,
  screenSessions = [],
  togglApiToken = "",
  togglWorkspaceId = "",
  togglCredentialsLocalOnly = false,
  onOpenTogglSettings,
}: TimeTrackerProps) {
  const isTogglConfigured = Boolean(togglApiToken && togglWorkspaceId)
  const [isRunning, setIsRunning] = useState(false)
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [localEntries, setLocalEntries] = useState<TimeEntry[]>([])
  const [description, setDescription] = useState("")
  const [selectedEventColor, setSelectedEventColor] = useState<string | null>(null)
  // カレンダーから選んだ予定の開始時刻。開始済みの予定なら、その時刻を計測の起点にする
  const [selectedEventStart, setSelectedEventStart] = useState<Date | null>(null)
  // 停止直後に経過時間のプレビューが復活しないようにするフラグ
  const [suppressStartPreview, setSuppressStartPreview] = useState(false)
  // このセッションで保存した区間の終端。一時停止→再開時に計測起点が
  // これより前へ戻らないようクランプする（同じ時間帯の二重記録を防ぐ）
  const lastSavedEndRef = useRef<Date | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [taskSource, setTaskSource] = useState<TaskSource>("calendar")
  const [togglCurrentEntry, setTogglCurrentEntry] = useState<{ description: string; project: string | null; is_running: boolean; start: string | null } | null>(null)
  const [togglLoading, setTogglLoading] = useState(false)
  const [togglError, setTogglError] = useState<string | null>(null)
  const [togglLastFetched, setTogglLastFetched] = useState<Date | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const togglIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isRunningRef = useRef(isRunning)

  const { t } = useTranslation()
  const { events, loading: calendarLoading, error: calendarError, needsReauth, fetchTodayEvents, formatEventTime, isEventNow } = useGoogleCalendar()

  // isRunning の最新値を ref で追跡（ポーリングコールバック内で使用）
  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  // 保存済みの手動タイマー履歴を localStorage から復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem("time_entries")
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (!Array.isArray(parsed)) return
      setLocalEntries(
        parsed
          .filter((e: any) => e && e.startTime)
          .map((e: any) => ({
            ...e,
            startTime: new Date(e.startTime),
            endTime: e.endTime ? new Date(e.endTime) : undefined,
          })),
      )
    } catch (err) {
      console.warn("Failed to load saved time entries:", err)
    }
  }, [])

  // 「開始」を押す前に、どの時刻から計測されるかを表示するための値。
  // 依存配列で使うため Date ではなくミリ秒で保持する
  // （毎レンダーで新しい Date を作ると useEffect が張り直され続けてしまうため）
  const pendingStartMs = suppressStartPreview
    ? null
    : taskSource === "toggl" && togglCurrentEntry?.is_running && togglCurrentEntry.start
      ? new Date(togglCurrentEntry.start).getTime()
      : taskSource === "calendar" && selectedEventStart
        ? selectedEventStart.getTime()
        : null

  // タイマー更新。
  // 計測中は実際の開始時刻から、未開始でも起点が決まっていれば
  // その時刻からの経過時間をプレビュー表示する（0:00 のままにしない）
  useEffect(() => {
    const originMs =
      isRunning && currentEntry ? currentEntry.startTime.getTime() : pendingStartMs

    if (originMs === null) {
      setCurrentTime(0)
      return
    }

    const tick = () => {
      setCurrentTime(Math.max(0, Math.floor((Date.now() - originMs) / 1000)))
    }
    tick()
    intervalRef.current = setInterval(tick, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning, currentEntry, pendingStartMs])

  // 現在のタスクを親コンポーネントに通知
  useEffect(() => {
    if (currentEntry) {
      onCurrentTaskChange(currentEntry.description)
    } else {
      onCurrentTaskChange(description)
    }
  }, [currentEntry, description, onCurrentTaskChange])

  const fetchTogglCurrentEntry = useCallback(async () => {
    if (!togglApiToken || !togglWorkspaceId) {
      setTogglError(t('tt_togglNotConfigured'))
      return
    }
    setTogglLoading(true)
    setTogglError(null)
    try {
      // 資格情報は原則サーバー側でuser_settingsから解決させる（URLに載せない）。
      // DBに保存できずこの端末にだけある場合のみ、POSTボディで渡す
      // （ボディはURLと違いアクセスログに残らない）
      const res = togglCredentialsLocalOnly
        ? await fetch("/api/toggl-current", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiToken: togglApiToken, workspaceId: togglWorkspaceId }),
          })
        : await fetch("/api/toggl-current")
      const data = await res.json()
      if (!res.ok || data.error) {
        setTogglError(data.error || t('tt_togglError'))
        return
      }
      // 説明が未入力のエントリもあるため、エントリの有無は entry_id で判定する
      const entry = data.entry_id
        ? { description: data.description || "", project: data.project, is_running: data.is_running, start: data.start ?? null }
        : null
      setTogglCurrentEntry(entry)
      setTogglLastFetched(new Date())
      // タイマー未実行時のみ説明欄を自動更新
      if (entry && entry.description && !isRunningRef.current) {
        setDescription(entry.description)
        setSelectedEventColor(null)
      }
    } catch {
      setTogglError(t('tt_togglError'))
    } finally {
      setTogglLoading(false)
    }
  }, [togglApiToken, togglWorkspaceId, togglCredentialsLocalOnly])

  // Togglモード時に3分ごと自動ポーリング（未設定のときは叩かない）
  useEffect(() => {
    if (taskSource !== "toggl" || !isTogglConfigured) {
      if (togglIntervalRef.current) {
        clearInterval(togglIntervalRef.current)
        togglIntervalRef.current = null
      }
      return
    }
    fetchTogglCurrentEntry()
    togglIntervalRef.current = setInterval(fetchTogglCurrentEntry, 3 * 60 * 1000)
    return () => {
      if (togglIntervalRef.current) {
        clearInterval(togglIntervalRef.current)
        togglIntervalRef.current = null
      }
    }
  }, [taskSource, isTogglConfigured, fetchTogglCurrentEntry])

  const saveToStorage = (entries: TimeEntry[]) => {
    localStorage.setItem("time_entries", JSON.stringify(entries))
  }

  // 計測の起点。「開始」を押した時刻ではなく、実際に作業が始まった時刻に合わせる
  //  - Toggl: 実行中エントリの開始時刻
  //  - カレンダー: 選択した（すでに始まっている）予定の開始時刻
  //  - どちらでもない手入力: 「開始」を押した時刻
  const resolveStartTime = (): Date => {
    let start: Date
    if (taskSource === "toggl" && togglCurrentEntry?.is_running && togglCurrentEntry.start) {
      start = new Date(togglCurrentEntry.start)
    } else if (taskSource === "calendar" && selectedEventStart) {
      start = selectedEventStart
    } else {
      return new Date()
    }
    // 一時停止→再開で予定/Togglの開始時刻に戻ると、保存済みの区間と
    // 重なる時間帯がもう一度計上されてしまう。セッション内で保存した
    // 区間の終端より前へは遡らない
    const savedEnd = lastSavedEndRef.current
    if (savedEnd && start < savedEnd) return savedEnd
    return start
  }

  const startTimer = () => {
    const taskDescription = description || t('tt_working')

    const startTime = resolveStartTime()

    const newEntry: TimeEntry = {
      id: Date.now().toString(),
      projectId: "",
      description: taskDescription,
      startTime,
      duration: 0,
      tags: [],
    }

    setCurrentEntry(newEntry)
    setIsRunning(true)
    setCurrentTime(Math.floor((Date.now() - startTime.getTime()) / 1000))
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

      const newEntries = [updatedEntry, ...localEntries]
      setLocalEntries(newEntries)
      saveToStorage(newEntries)
      // 再開時に計測起点がこの区間より前へ戻らないようにする
      lastSavedEndRef.current = now
    }

    setCurrentEntry(null)
    setIsRunning(false)
    setCurrentTime(0)
    // 停止したのに経過時間プレビューが復活しないようにする
    setSuppressStartPreview(true)
    // 一時停止後の再開で予定開始時刻へ再アンカーしないようクリアする
    // （再び予定起点で計測したい場合はカレンダーから予定を選び直す）
    setSelectedEventStart(null)
    onTimeEntryChange(null)
  }

  const stopTimer = () => {
    pauseTimer()
    setDescription("")
    setSelectedEventStart(null)
    setSelectedEventColor(null)
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
    return date.toLocaleTimeString("ja-JP", {  // keep ja-JP for time formatting
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getTodayEntries = () => {
    const today = new Date().toDateString()
    return localEntries.filter(
      (entry) => entry.startTime instanceof Date && entry.startTime.toDateString() === today,
    )
  }

  const deleteEntry = (entryId: string) => {
    const newEntries = localEntries.filter((entry) => entry.id !== entryId)
    setLocalEntries(newEntries)
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
            <Clock className="h-5 w-5 text-orange-600" />
            {t('tt_title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {/* 現在のタイマー表示 */}
          <div className="text-center py-6 bg-gradient-to-b from-orange-50 to-white rounded-lg border border-orange-100">
            <div
              className={`text-6xl font-mono font-bold mb-3 ${
                !isRunning && pendingStartMs !== null ? "text-orange-400" : "text-orange-600"
              }`}
            >
              {formatDuration(currentTime)}
            </div>

            {/* いつを起点に数えているのかを明示する
                （「開始」を押した時刻ではなく、実際に作業を始めた時刻から数えるため） */}
            <div className="text-xs text-gray-500">
              {isRunning && currentEntry
                ? t('tt_elapsedSince', { time: formatTime(currentEntry.startTime) })
                : pendingStartMs !== null
                  ? t('tt_willCountFrom', { time: formatTime(new Date(pendingStartMs)) })
                  : t('tt_notStarted')}
            </div>

            {currentEntry && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mt-1">
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
              onClick={() => {
                setTaskSource("calendar")
                setSuppressStartPreview(false)
              }}
              disabled={isRunning}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                taskSource === "calendar"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Calendar className="h-4 w-4" />
              {t('tt_googleCalendar')}
            </button>
            <button
              onClick={() => {
                setTaskSource("toggl")
                setSuppressStartPreview(false)
              }}
              disabled={isRunning}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                taskSource === "toggl"
                  ? "bg-orange-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <ToggleLeft className="h-4 w-4" />
              {t('tt_toggl')}
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
                  {t('tt_selectFromCalendar')}
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
                    <span className="text-xs font-medium text-green-800">{t('tt_todaySchedule')}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchTodayEvents}
                      disabled={calendarLoading}
                      aria-label={t('common_refresh')}
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
                          {t('tt_reloginPrompt')}
                        </div>
                      )}
                    </div>
                  )}

                  {!calendarLoading && !calendarError && events.length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-2">{t('tt_noEventsToday')}</div>
                  )}

                  {events.map((event) => {
                    const color = getEventColor(event.colorId)
                    return (
                      <button
                        key={event.id}
                        onClick={() => {
                          setDescription(event.summary)
                          setSelectedEventColor(color)
                          // すでに始まっている予定なら、予定の開始時刻を計測の起点にする
                          // （「開始」を押した時刻ではなく、実際に作業を始めた時刻から数える）
                          const eventStart = event.start.dateTime ? new Date(event.start.dateTime) : null
                          setSelectedEventStart(
                            eventStart && eventStart.getTime() <= Date.now() ? eventStart : null,
                          )
                          setSuppressStartPreview(false)
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

          {/* Toggl連携（自動同期） */}
          {taskSource === "toggl" && (
            <div className="border border-orange-100 rounded-lg p-3 bg-orange-50 space-y-2">
              {/* 未設定のときはエラーを出し続けるのではなく、設定への導線を主役にする */}
              {!isTogglConfigured ? (
                <div className="space-y-2 py-1">
                  <div className="text-xs text-orange-800">{t('tt_togglSetupPrompt')}</div>
                  {onOpenTogglSettings && (
                    <Button
                      size="sm"
                      onClick={onOpenTogglSettings}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      <Settings className="h-3.5 w-3.5 mr-1.5" />
                      {t('tt_togglSetupButton')}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-orange-800">
                    {t('tt_togglAutoSync')}
                    {togglLastFetched && (
                      <span className="ml-2 text-orange-500 font-normal">
                        {t('tt_lastFetched')} {togglLastFetched.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchTogglCurrentEntry}
                    disabled={togglLoading || isRunning}
                    aria-label={t('common_refresh')}
                    className="h-6 px-2 text-xs text-orange-700 hover:bg-orange-100"
                  >
                    {togglLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </Button>
                </div>

                {/* 何が同期されるのかを明示（作業内容だけを取り込む片方向連携） */}
                <div className="text-[11px] leading-snug text-orange-700">{t('tt_togglSyncScope')}</div>

                {togglError && (
                  <div className="text-xs text-red-600 bg-red-50 rounded p-2 space-y-2">
                    <div>{togglError}</div>
                    {onOpenTogglSettings && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onOpenTogglSettings}
                        className="h-7 text-xs bg-white"
                      >
                        {t('tt_togglSetupButton')}
                      </Button>
                    )}
                  </div>
                )}

                {!togglLoading && !togglError && !togglCurrentEntry && (
                  <div className="text-xs text-gray-500 text-center py-2">{t('tt_noTogglEntry')}</div>
                )}

                {togglCurrentEntry && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                    togglCurrentEntry.is_running
                      ? "bg-orange-200 border border-orange-400 text-orange-900"
                      : "bg-white border border-gray-200 text-gray-700"
                  }`}>
                    {togglCurrentEntry.is_running && (
                      <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{togglCurrentEntry.description || t('tt_noDescription')}</div>
                      {togglCurrentEntry.project && (
                        <div className="text-xs text-gray-500 mt-0.5">{togglCurrentEntry.project}</div>
                      )}
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          )}

          {/* 作業内容 */}
          <div className="space-y-2">
            <Label htmlFor="description" className="flex items-center gap-2">
              {t('tt_taskLabel')}
              <span className="text-xs text-gray-500">{t('tt_taskLabelNote')}</span>
            </Label>
            <Input
              id="description"
              placeholder={t('tt_taskPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isRunning}
              className={isRunning ? "bg-orange-50 border-orange-200" : ""}
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
            />
            <div className="text-xs text-gray-500">
              {t('tt_taskHint')}
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
                {t('tt_start')}
              </Button>
            ) : (
              <>
                <Button
                  onClick={pauseTimer}
                  variant="outline"
                  className="flex-1 flex items-center justify-center gap-2 h-11 bg-transparent"
                >
                  <Pause className="h-4 w-4" />
                  {t('tt_pause')}
                </Button>
                <Button
                  onClick={stopTimer}
                  variant="destructive"
                  className="flex-1 flex items-center justify-center gap-2 h-11"
                >
                  <Square className="h-4 w-4" />
                  {t('tt_stop')}
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
            <CardTitle className="text-lg text-gray-800">{t('tt_todayEntries')}</CardTitle>
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
                      aria-label={t('common_delete')}
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
            <Monitor className="h-4 w-4 text-orange-500" />
            {t('tt_screenSessions')}
          </CardTitle>
          {/* 何が記録されるカードなのかが分からないという指摘への対応 */}
          <p className="text-xs text-gray-500 mt-1">{t('tt_screenSessionsDesc')}</p>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {todayScreenSessions.map((session) => {
              const duration = session.endTime
                ? Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000)
                : null
              return (
                <div key={session.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <div className="flex-1">
                    {session.task && (
                      <div className="text-sm font-medium text-gray-700 mb-0.5">{session.task}</div>
                    )}
                    <div className="text-xs text-gray-500">
                      {formatTime(session.startTime)}
                      {session.endTime ? ` - ${formatTime(session.endTime)}` : ` - ${t('tt_measuring')}`}
                    </div>
                  </div>
                  {duration !== null && (
                    <Badge variant="outline" className="font-mono border-orange-200 text-orange-700">
                      {formatDuration(duration)}
                    </Badge>
                  )}
                </div>
              )
            })}
            {todayScreenSessions.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                {t('tt_noScreenSessions')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
