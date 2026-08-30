"use client"
import { useTranslation } from "@/lib/i18n"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BarChart3, Plus, Loader2, AlertCircle, RefreshCw, Info } from "lucide-react"
import { getWorkLogsInRange, type WorkLog } from "@/lib/supabase"
import { computePerLogDurations } from "@/lib/log-stats"

export interface ActivityCategory {
  id: string
  name: string
  color: string
}

export const DEFAULT_CATEGORIES: ActivityCategory[] = [
  { id: "email", name: "メールチェック", color: "#3B82F6" },
  { id: "entertainment", name: "娯楽", color: "#EF4444" },
  { id: "chat", name: "チャット", color: "#8B5CF6" },
  { id: "research", name: "リサーチ", color: "#10B981" },
  { id: "meeting", name: "ミーティング", color: "#F59E0B" },
  { id: "sns", name: "業務以外のSNS", color: "#EC4899" },
  { id: "other", name: "未分類", color: "#6B7280" },
]

const COLOR_OPTIONS = [
  "#3B82F6", "#EF4444", "#8B5CF6", "#10B981", "#F59E0B",
  "#EC4899", "#6B7280", "#14B8A6", "#F97316", "#84CC16",
]

// ---- 期間プリセット --------------------------------------------------------

export type RangePreset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "last7days"
  | "custom"

const RANGE_PRESETS: RangePreset[] = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "last7days",
  "custom",
]

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

// 週の開始は月曜（Togglのレポート画面と同じ）
function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d)
  const dow = (x.getDay() + 6) % 7 // Mon=0 ... Sun=6
  return addDays(x, -dow)
}

function startOfMonth(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

// プリセットを実際の期間 [from, to)（toは排他的）に解決する。
// 期間の境界は利用者のローカルタイムゾーンで計算する
export function resolveRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
  now: Date = new Date(),
): { from: Date; to: Date } | null {
  const today = startOfDay(now)
  switch (preset) {
    case "today":
      return { from: today, to: addDays(today, 1) }
    case "yesterday":
      return { from: addDays(today, -1), to: today }
    case "thisWeek": {
      const s = startOfWeekMonday(now)
      return { from: s, to: addDays(s, 7) }
    }
    case "lastWeek": {
      const s = addDays(startOfWeekMonday(now), -7)
      return { from: s, to: addDays(s, 7) }
    }
    case "thisMonth": {
      const s = startOfMonth(now)
      const e = new Date(s)
      e.setMonth(e.getMonth() + 1)
      return { from: s, to: e }
    }
    case "lastMonth": {
      const e = startOfMonth(now)
      const s = new Date(e)
      s.setMonth(s.getMonth() - 1)
      return { from: s, to: e }
    }
    case "last7days": {
      // 今日を含む直近7日間
      const e = addDays(today, 1)
      return { from: addDays(e, -7), to: e }
    }
    case "custom": {
      if (!customFrom || !customTo) return null
      const f = new Date(`${customFrom}T00:00:00`)
      const t = new Date(`${customTo}T00:00:00`)
      if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f.getTime() > t.getTime()) return null
      return { from: f, to: addDays(t, 1) }
    }
  }
}

// ---- 選択期間の永続化 ------------------------------------------------------

interface StoredRange {
  preset: RangePreset
  customFrom: string
  customTo: string
}

// キーは必ずユーザーIDでスコープする（共有端末で他人の選択を引き継がない）
const rangeStorageKey = (userId: string) => `flownudge_breakdown_range_${userId}`

function loadStoredRange(userId: string): StoredRange | null {
  if (!userId || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(rangeStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!RANGE_PRESETS.includes(parsed?.preset)) return null
    return {
      preset: parsed.preset,
      customFrom: typeof parsed.customFrom === "string" ? parsed.customFrom : "",
      customTo: typeof parsed.customTo === "string" ? parsed.customTo : "",
    }
  } catch {
    return null
  }
}

function saveStoredRange(userId: string, value: StoredRange) {
  if (!userId || typeof window === "undefined") return
  try {
    localStorage.setItem(rangeStorageKey(userId), JSON.stringify(value))
  } catch {
    /* プライベートモード等では保存しない */
  }
}

// ---- 本体 ------------------------------------------------------------------

const RANGE_FETCH_LIMIT = 5000

interface ActivityBreakdownProps {
  userId: string
  categories: ActivityCategory[]
  captureInterval: number
  onCategoriesChange: (categories: ActivityCategory[]) => void
}

export function ActivityBreakdown({
  userId,
  categories,
  captureInterval,
  onCategoriesChange,
}: ActivityBreakdownProps) {
  const { t, language } = useTranslation()
  const dateLocale = language === "ja" ? "ja-JP" : "en-US"

  const formatDuration = (seconds: number): string => {
    const s = Math.round(seconds)
    if (s < 60) return t('ab_seconds', { n: s })
    if (s < 3600) return t('ab_minutes', { n: Math.round(s / 60) })
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return m > 0 ? t('ab_hoursMinutes', { h, m }) : t('ab_hours', { h })
  }

  const CAT_NAME_TO_KEY: Record<string, 'ab_cat_emailCheck' | 'ab_cat_entertainment' | 'ab_cat_chat' | 'ab_cat_research' | 'ab_cat_meeting' | 'ab_cat_sns' | 'ab_cat_uncategorized'> = {
    'メールチェック': 'ab_cat_emailCheck',
    '娯楽': 'ab_cat_entertainment',
    'チャット': 'ab_cat_chat',
    'リサーチ': 'ab_cat_research',
    'ミーティング': 'ab_cat_meeting',
    '業務以外のSNS': 'ab_cat_sns',
    '未分類': 'ab_cat_uncategorized',
  }
  const catDisplayName = (name: string) => {
    const key = CAT_NAME_TO_KEY[name]
    return key ? t(key) : name
  }
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[0])

  // 期間選択（保存済みの選択があれば復元）
  const stored = useMemo(() => loadStoredRange(userId), [userId])
  const [preset, setPreset] = useState<RangePreset>(stored?.preset ?? "today")
  const [customFrom, setCustomFrom] = useState(stored?.customFrom ?? "")
  const [customTo, setCustomTo] = useState(stored?.customTo ?? "")

  // userId が後から確定する（初回ロード）ケースで保存済み選択を反映する
  useEffect(() => {
    const restored = loadStoredRange(userId)
    if (restored) {
      setPreset(restored.preset)
      setCustomFrom(restored.customFrom)
      setCustomTo(restored.customTo)
    }
  }, [userId])

  useEffect(() => {
    saveStoredRange(userId, { preset, customFrom, customTo })
  }, [userId, preset, customFrom, customTo])

  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  )

  // 期間内のログをDBから取得する。
  // 親のworkLogs（直近500件の窓）では「今月」「先月」を集計できない
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const requestIdRef = useRef(0)

  const fetchLogs = useCallback(async () => {
    if (!userId) return
    if (!range) {
      // カスタム期間が未確定の間、前の期間の集計を出したままにしない
      setLogs([])
      setTruncated(false)
      setFetchError(false)
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    setFetchError(false)
    try {
      const { data, error, truncated: wasTruncated } = await getWorkLogsInRange(
        userId,
        range.from.toISOString(),
        range.to.toISOString(),
        RANGE_FETCH_LIMIT,
        // 集計に必要な列だけ取得（全列だと1か月ぶんで数MBになる）
        "id, timestamp, work_category",
      )
      if (requestId !== requestIdRef.current) return // 古い応答は捨てる
      if (error || !data) {
        console.warn("Failed to load work logs for breakdown:", error)
        setFetchError(true)
        setLogs([])
        setTruncated(false)
        return
      }
      // 「全てクリア」済みのログはUIと同様に隠す
      // （DB削除が効かない環境向けのローカルマーカーと整合させる）
      let visible = data
      try {
        const clearedAt = localStorage.getItem(`work_logs_cleared_at_${userId}`)
        if (clearedAt) {
          const clearedTime = new Date(clearedAt).getTime()
          visible = data.filter((log) => new Date(log.timestamp).getTime() > clearedTime)
        }
      } catch {
        /* localStorage不可の環境ではそのまま表示 */
      }
      setLogs(visible)
      setTruncated(wasTruncated)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      console.warn("Failed to load work logs for breakdown:", err)
      setFetchError(true)
      setLogs([])
      setTruncated(false)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [userId, range])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const durations = useMemo(
    () => computePerLogDurations(logs, captureInterval),
    [logs, captureInterval],
  )

  const totalSeconds = useMemo(() => durations.reduce((sum, d) => sum + d, 0), [durations])

  const breakdown = useMemo(() => {
    const map: Record<string, number> = {}
    categories.forEach((c) => {
      map[c.name] = 0
    })
    if (!("未分類" in map)) {
      map["未分類"] = 0
    }

    logs.forEach((log, i) => {
      const key = log.work_category || "未分類"
      if (key in map) {
        map[key] += durations[i]
      } else {
        map["未分類"] += durations[i]
      }
    })

    if (totalSeconds === 0) return []

    return Object.entries(map)
      .filter(([, seconds]) => seconds > 0)
      .map(([name, seconds]) => {
        const cat = categories.find((c) => c.name === name)
        return {
          name,
          seconds,
          percentage: Math.round((seconds / totalSeconds) * 100),
          color: cat?.color || "#9CA3AF",
        }
      })
      .sort((a, b) => b.seconds - a.seconds)
  }, [logs, durations, totalSeconds, categories])

  // 表示用の期間（toは排他的なので、表示は前日までのinclusiveにする）
  const rangeLabel = useMemo(() => {
    if (!range) return ""
    const fromLabel = range.from.toLocaleDateString(dateLocale)
    const toInclusive = addDays(range.to, -1)
    const toLabel = toInclusive.toLocaleDateString(dateLocale)
    return fromLabel === toLabel ? fromLabel : `${fromLabel} 〜 ${toLabel}`
  }, [range, dateLocale])

  const PRESET_LABEL_KEYS: Record<RangePreset, 'ab_rangeToday' | 'ab_rangeYesterday' | 'ab_rangeThisWeek' | 'ab_rangeLastWeek' | 'ab_rangeThisMonth' | 'ab_rangeLastMonth' | 'ab_rangeLast7Days' | 'ab_rangeCustom'> = {
    today: 'ab_rangeToday',
    yesterday: 'ab_rangeYesterday',
    thisWeek: 'ab_rangeThisWeek',
    lastWeek: 'ab_rangeLastWeek',
    thisMonth: 'ab_rangeThisMonth',
    lastMonth: 'ab_rangeLastMonth',
    last7days: 'ab_rangeLast7Days',
    custom: 'ab_rangeCustom',
  }

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return
    const newCat: ActivityCategory = {
      id: Date.now().toString(),
      name: newCategoryName.trim(),
      color: newCategoryColor,
    }
    onCategoriesChange([...categories, newCat])
    setNewCategoryName("")
  }

  const handleRemoveCategory = (id: string) => {
    onCategoriesChange(categories.filter((c) => c.id !== id))
  }

  return (
    <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
      <CardHeader className="pb-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-t-lg border-b border-gray-100">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <BarChart3 className="h-5 w-5 text-orange-600" />
            {t('ab_title')}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryEditor(!showCategoryEditor)}
            className="text-xs"
          >
            {t('ab_editCategories')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* 期間プリセット（Togglのレポート画面と同型の並び） */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {RANGE_PRESETS.map((p) => (
              <Button
                key={p}
                variant={preset === p ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setPreset(p)}
              >
                {t(PRESET_LABEL_KEYS[p])}
              </Button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 text-gray-600">
                {t('ab_rangeFrom')}
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-auto text-sm"
                />
              </label>
              <label className="flex items-center gap-1.5 text-gray-600">
                {t('ab_rangeTo')}
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-auto text-sm"
                />
              </label>
            </div>
          )}

          {range ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{rangeLabel}</span>
              <span>・</span>
              <span>{t('ab_rangeLogCount', { count: logs.length })}</span>
              <button
                onClick={fetchLogs}
                className="ml-auto inline-flex items-center gap-1 text-gray-400 hover:text-gray-600"
                title={t('common_refresh')}
              >
                <RefreshCw className="h-3 w-3" />
                {t('common_refresh')}
              </button>
            </div>
          ) : (
            <div className="text-xs text-gray-400">{t('ab_rangeCustomHint')}</div>
          )}
        </div>

        {truncated && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            {t('ab_rangeTruncated', { limit: RANGE_FETCH_LIMIT })}
          </div>
        )}

        {showCategoryEditor && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            <div className="text-sm font-medium text-gray-700">{t('ab_categoryManagement')}</div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-1 bg-white border rounded-full px-2 py-1 text-xs"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span>{cat.name}</span>
                  <button
                    onClick={() => handleRemoveCategory(cat.id)}
                    className="text-gray-400 hover:text-red-500 ml-1 leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewCategoryColor(color)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: newCategoryColor === color ? "#1F2937" : "transparent",
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={t('ab_newCategoryPlaceholder')}
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              />
              <Button size="sm" onClick={handleAddCategory} className="h-8 gap-1 flex-shrink-0">
                <Plus className="h-3 w-3" />
                {t('common_add')}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('ab_rangeLoading')}
          </div>
        ) : fetchError ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div className="text-sm text-red-800">
              {t('ab_rangeError')}
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={fetchLogs} className="h-7 text-xs">
                  {t('ab_retry')}
                </Button>
              </div>
            </div>
          </div>
        ) : totalSeconds === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {t('ab_noLogsInRange')}
            <br />
            {t('ab_noLogsHint')}
          </div>
        ) : (
          <>
            {/* iOS風セグメントバー */}
            <div className="space-y-1">
              <div className="flex h-8 rounded-full overflow-hidden gap-px">
                {breakdown.map((item, i) => (
                  <div
                    key={item.name}
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color,
                      minWidth: item.percentage > 0 ? "4px" : "0",
                    }}
                    title={`${catDisplayName(item.name)}: ${item.percentage}% (${formatDuration(item.seconds)})`}
                    className={`transition-all duration-500 ${i === 0 ? "rounded-l-full" : ""} ${
                      i === breakdown.length - 1 ? "rounded-r-full" : ""
                    }`}
                  />
                ))}
              </div>
              <div className="text-xs text-right text-gray-400">
                {t('ab_totalTime')} {formatDuration(totalSeconds)}
              </div>
            </div>

            {/* 凡例 */}
            <div className="space-y-2">
              {breakdown.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate">{catDisplayName(item.name)}</span>
                      <span className="text-gray-500 text-xs ml-2 flex-shrink-0">
                        {formatDuration(item.seconds)}（{item.percentage}%）
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 指標の見方（常設。各数値がどう算出されているかの解説） */}
        <details className="rounded-lg border border-gray-200 bg-gray-50/60">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-gray-400" />
            {t('mx_title')}
          </summary>
          <div className="px-3 pb-3 space-y-2.5 text-xs text-gray-600 leading-relaxed">
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
              {t('mx_noTaskNote')}
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('mx_focus')}</span>
              <span className="mx-1 text-gray-300">—</span>
              {t('mx_focusDesc')}
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('mx_avgFocus')}</span>
              <span className="mx-1 text-gray-300">—</span>
              {t('mx_avgFocusDesc')}
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('mx_productive')}</span>
              <span className="mx-1 text-gray-300">—</span>
              {t('mx_productiveDesc')}
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('mx_category')}</span>
              <span className="mx-1 text-gray-300">—</span>
              {t('mx_categoryDesc')}
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('mx_distraction')}</span>
              <span className="mx-1 text-gray-300">—</span>
              {t('mx_distractionDesc')}
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('mx_confidence')}</span>
              <span className="mx-1 text-gray-300">—</span>
              {t('mx_confidenceDesc')}
            </div>
            <div>
              <span className="font-medium text-gray-700">{t('mx_breakdownTime')}</span>
              <span className="mx-1 text-gray-300">—</span>
              {t('mx_breakdownTimeDesc')}
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
