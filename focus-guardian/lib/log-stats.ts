// 作業ログの時間集計ロジック。
// 作業内訳タブ（クライアント）と週次レポート配信（サーバー）の両方から使う。
// 重複実装するとクリップ仕様がズレて数字が食い違うため、必ずここへ集約する

export interface LogForStats {
  timestamp: string
  category?: string
  work_category?: string
  activity?: string
  focus_score?: number | null
}

// 「件数 × 現在のキャプチャ間隔」は (a) 間隔変更後に過去ログを誤って数える
// (b) 解析を止めていた空白まで数えない、の2点で不正確だった。
// 代わりに、時刻昇順の隣接ログの実時間差をそのログの所要時間とし、
// 差が min(間隔×3, 300秒) を超える区間は「中断」とみなして上限でクリップする。
// 期間内の最後のログは現在のキャプチャ間隔ぶんとして数える
export function computePerLogDurations(
  sortedLogs: Array<{ timestamp: string }>,
  captureIntervalSeconds: number,
): number[] {
  const cap = Math.min(captureIntervalSeconds * 3, 300)
  return sortedLogs.map((log, i) => {
    if (i === sortedLogs.length - 1) return captureIntervalSeconds
    const delta =
      (new Date(sortedLogs[i + 1].timestamp).getTime() - new Date(log.timestamp).getTime()) / 1000
    if (!Number.isFinite(delta) || delta < 0) return captureIntervalSeconds
    return Math.min(delta, cap)
  })
}

export interface WeeklyStats {
  logCount: number
  totalSeconds: number
  /** focus_score を持つログの単純平均（無ければ null） */
  avgFocus: number | null
  /** category === "productive" の件数割合（%） */
  productivePct: number | null
  distractedCount: number
  /** work_category 別の秒数上位（降順） */
  categorySeconds: Array<{ name: string; seconds: number }>
  /** 脱線ログの activity 頻度上位（降順） */
  topDistractions: Array<{ activity: string; count: number }>
}

// 1週間ぶんのログ（時刻昇順）から配信用の集計を作る
export function computeWeeklyStats(
  logs: LogForStats[],
  captureIntervalSeconds: number,
  topN = 5,
): WeeklyStats {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
  const durations = computePerLogDurations(sorted, captureIntervalSeconds)
  const totalSeconds = sorted.length === 0 ? 0 : durations.reduce((sum, d) => sum + d, 0)

  const catMap: Record<string, number> = {}
  sorted.forEach((log, i) => {
    const key = log.work_category || "未分類"
    catMap[key] = (catMap[key] || 0) + durations[i]
  })

  const focusScores = sorted
    .map((l) => l.focus_score)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  const avgFocus =
    focusScores.length > 0
      ? Math.round(focusScores.reduce((s, v) => s + v, 0) / focusScores.length)
      : null

  const productiveCount = sorted.filter((l) => l.category === "productive").length
  const distracted = sorted.filter((l) => l.category === "distracted")

  const distractionMap: Record<string, number> = {}
  distracted.forEach((l) => {
    const key = l.activity || "不明"
    distractionMap[key] = (distractionMap[key] || 0) + 1
  })

  return {
    logCount: sorted.length,
    totalSeconds: Math.round(totalSeconds),
    avgFocus,
    productivePct: sorted.length > 0 ? Math.round((productiveCount / sorted.length) * 100) : null,
    distractedCount: distracted.length,
    categorySeconds: Object.entries(catMap)
      .map(([name, seconds]) => ({ name, seconds: Math.round(seconds) }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, topN),
    topDistractions: Object.entries(distractionMap)
      .map(([activity, count]) => ({ activity, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
  }
}

// ---- タイムゾーン付きの週境界（外部ライブラリなし） ----------------------

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** 不正なタイムゾーン名は Asia/Tokyo にフォールバックする */
export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== "string" || !tz) return "Asia/Tokyo"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz
  } catch {
    return "Asia/Tokyo"
  }
}

function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    // 一部環境は深夜0時を "24" と返す
    h: Number(parts.hour) % 24,
    min: Number(parts.minute),
    s: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  }
}

// tz の壁時計で (y, m, d) 00:00 になる瞬間のUTC時刻。
// UTC仮置き→ずれを補正、を2回行う（DST境界でも収束する）
function zonedMidnightUTC(y: number, m: number, d: number, timeZone: string): Date {
  let ts = Date.UTC(y, m - 1, d, 0, 0, 0)
  for (let i = 0; i < 2; i++) {
    const p = getZonedParts(new Date(ts), timeZone)
    const rendered = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s)
    const target = Date.UTC(y, m - 1, d, 0, 0, 0)
    ts += target - rendered
  }
  return new Date(ts)
}

function addDaysYMD(y: number, m: number, d: number, delta: number): [number, number, number] {
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]
}

export interface WeekRange {
  from: Date
  /** 排他的（この時刻を含まない） */
  to: Date
  /** 表示用: 週の初日と最終日（tzの壁時計、YYYY-MM-DD） */
  fromLabel: string
  toLabel: string
}

/** now から見た「先週の月曜0:00〜今週の月曜0:00」（tzの壁時計基準・月曜始まり） */
export function lastWeekRange(now: Date, timeZone: string): WeekRange {
  const tz = safeTimeZone(timeZone)
  const p = getZonedParts(now, tz)
  const [ty, tm, td] = addDaysYMD(p.y, p.m, p.d, -p.weekday) // 今週の月曜
  const [fy, fm, fd] = addDaysYMD(ty, tm, td, -7) // 先週の月曜
  const [ly, lm, ld] = addDaysYMD(ty, tm, td, -1) // 先週の日曜（表示用）
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    from: zonedMidnightUTC(fy, fm, fd, tz),
    to: zonedMidnightUTC(ty, tm, td, tz),
    fromLabel: `${fy}-${pad(fm)}-${pad(fd)}`,
    toLabel: `${ly}-${pad(lm)}-${pad(ld)}`,
  }
}

/** now までの直近7日間（テスト送信のプレビュー用） */
export function last7DaysRange(now: Date, timeZone: string): WeekRange {
  const tz = safeTimeZone(timeZone)
  const p = getZonedParts(now, tz)
  const [ny, nm, nd] = addDaysYMD(p.y, p.m, p.d, 1) // 明日0:00（今日を含める）
  const [fy, fm, fd] = addDaysYMD(p.y, p.m, p.d, -6)
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    from: zonedMidnightUTC(fy, fm, fd, tz),
    to: zonedMidnightUTC(ny, nm, nd, tz),
    fromLabel: `${fy}-${pad(fm)}-${pad(fd)}`,
    toLabel: `${p.y}-${pad(p.m)}-${pad(p.d)}`,
  }
}

export function formatSeconds(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s}秒`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h === 0) return `${m}分`
  return m > 0 ? `${h}時間${m}分` : `${h}時間`
}
