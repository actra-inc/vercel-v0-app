// まとめレポート・日報のプロンプト、出力スキーマ、フォールバック生成、正規化（純関数）。
// 旧 /api/generate-summary-report と /api/generate-daily-report のロジックを、
// 端末内 AI で使うためにクライアント側へ移したもの。推論の呼び出しは lib/local-reports.ts。

// ---- まとめレポート（直近3件） -----------------------------------------------

export interface SummarySourceLog {
  timestamp: string
  activity: string
  category: string
  details: string
  focus_score?: number
  distraction_check?: { is_distracted: boolean; reason: string }
}

export interface SummaryReportData {
  summary: string
  productivity_analysis: string
  focus_trend: string
  distraction_summary: string
  time_distribution: { productive_time: number; distracted_time: number; neutral_time: number }
  key_findings: string[]
  recommendations: string[]
  overall_score: number
}

export const SUMMARY_REPORT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    productivity_analysis: { type: "string" },
    focus_trend: { type: "string" },
    distraction_summary: { type: "string" },
    time_distribution: {
      type: "object",
      properties: {
        productive_time: { type: "number" },
        distracted_time: { type: "number" },
        neutral_time: { type: "number" },
      },
      required: ["productive_time", "distracted_time", "neutral_time"],
    },
    key_findings: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
    overall_score: { type: "number" },
  },
  required: [
    "summary",
    "productivity_analysis",
    "focus_trend",
    "distraction_summary",
    "time_distribution",
    "key_findings",
    "recommendations",
    "overall_score",
  ],
}

export function generateFallbackSummaryReport(logs: SummarySourceLog[]): SummaryReportData {
  const total = logs.length
  const productive = logs.filter((l) => l.category === "productive").length
  const distracted = logs.filter((l) => l.category === "distracted").length
  const neutral = total - productive - distracted

  const productivePct = Math.round((productive / total) * 100)
  const distractedPct = Math.round((distracted / total) * 100)
  const neutralPct = 100 - productivePct - distractedPct

  const avgFocus = Math.round(logs.reduce((sum, l) => sum + (l.focus_score ?? 50), 0) / total)

  const distractionReasons = logs
    .filter((l) => l.distraction_check?.is_distracted)
    .map((l) => l.distraction_check?.reason)
    .filter(Boolean) as string[]

  const activities = [...new Set(logs.map((l) => l.activity).filter(Boolean))]

  const summary =
    `直近${total}件の作業ログを分析しました。` +
    `生産的な活動が${productivePct}%、脱線が${distractedPct}%、中立が${neutralPct}%でした。` +
    `主な活動: ${activities.slice(0, 3).join("、")}。` +
    `平均集中度スコアは${avgFocus}/100です。`

  const productivityAnalysis =
    productivePct >= 70
      ? `作業の${productivePct}%が生産的に分類されました。高い集中力を維持できています。`
      : productivePct >= 40
        ? `作業の${productivePct}%が生産的でした。さらに集中力を高める余地があります。`
        : `生産的な時間が${productivePct}%にとどまりました。作業環境の見直しを検討してください。`

  const focusTrend =
    avgFocus >= 70
      ? "集中度スコアは高水準を維持しています。この調子を続けましょう。"
      : avgFocus >= 50
        ? "集中度スコアにやや波があります。定期的な休憩を取ることで改善できます。"
        : "集中度スコアが低めです。作業場所の整理やノイズ対策を試してみてください。"

  const distractionSummary =
    distractionReasons.length === 0
      ? "記録期間中、脱線は検知されませんでした。"
      : `${distractionReasons.length}回の脱線が検知されました。主な理由: ${distractionReasons.slice(0, 2).join("、")}`

  const keyFindings = [
    `${total}件の作業ログを分析（生産的:${productive}件、脱線:${distracted}件、中立:${neutral}件）`,
    `平均集中度スコア: ${avgFocus}/100`,
    activities.length > 0 ? `主な活動: ${activities.slice(0, 2).join("、")}` : "活動記録あり",
  ]

  const recommendations: string[] = []
  if (distractedPct > 30)
    recommendations.push("脱線が多めです。タスクを細分化して短時間集中を繰り返すPomodoro法を試してみてください。")
  if (avgFocus < 60) recommendations.push("集中度向上のため、通知をオフにして作業専用の環境を作ることをお勧めします。")
  if (recommendations.length === 0)
    recommendations.push("現在のペースを維持して作業を続けましょう。定期的な休憩も忘れずに。")

  return {
    summary,
    productivity_analysis: productivityAnalysis,
    focus_trend: focusTrend,
    distraction_summary: distractionSummary,
    time_distribution: { productive_time: productivePct, distracted_time: distractedPct, neutral_time: neutralPct },
    key_findings: keyFindings,
    recommendations,
    overall_score: avgFocus,
  }
}

// モデルの応答は形式が保証されないため、保存前に必須フィールドを補完する
// （欠損したまま DB に保存されるとレポート表示側がクラッシュする）
export function normalizeSummaryReport(raw: any, logs: SummarySourceLog[]): SummaryReportData {
  const fallback = generateFallbackSummaryReport(logs)
  const num = (v: any, def: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : def
  }
  const str = (v: any, def: string) => (typeof v === "string" && v.trim() ? v : def)
  const strArray = (v: any, def: string[]) => {
    if (!Array.isArray(v)) return def
    const arr = v.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    return arr.length > 0 ? arr : def
  }

  return {
    summary: str(raw?.summary, fallback.summary),
    productivity_analysis: str(raw?.productivity_analysis, fallback.productivity_analysis),
    focus_trend: str(raw?.focus_trend, fallback.focus_trend),
    distraction_summary: str(raw?.distraction_summary, fallback.distraction_summary),
    time_distribution: {
      productive_time: num(raw?.time_distribution?.productive_time, fallback.time_distribution.productive_time),
      distracted_time: num(raw?.time_distribution?.distracted_time, fallback.time_distribution.distracted_time),
      neutral_time: num(raw?.time_distribution?.neutral_time, fallback.time_distribution.neutral_time),
    },
    key_findings: strArray(raw?.key_findings, fallback.key_findings),
    recommendations: strArray(raw?.recommendations, fallback.recommendations),
    overall_score: num(raw?.overall_score, fallback.overall_score),
  }
}

export function buildSummaryReportPrompt(logs: SummarySourceLog[], timeZone: string, lang: "ja" | "en"): string {
  const block = (log: SummarySourceLog, i: number) =>
    `【作業ログ${i + 1}】
- 時刻: ${new Date(log.timestamp).toLocaleString("ja-JP", { timeZone })}
- 活動: ${log.activity}
- カテゴリ: ${log.category}
- 詳細: ${log.details}
- 集中度スコア: ${log.focus_score || 0}/100
${log.distraction_check ? `- 脱線検知: ${log.distraction_check.is_distracted ? "あり" : "なし"}` : ""}`
  const outputLang = lang === "en" ? "英語" : "日本語"

  return `
以下は直近${logs.length}件の作業ログです。これらを統合分析して、包括的なレポートを生成してください。文章は${outputLang}で書いてください。

${logs.map(block).join("\n\n")}

以下のJSON形式で統合レポートを生成してください：

{
  "summary": "全体的な作業傾向の要約（200文字程度）",
  "productivity_analysis": "生産性の分析（150文字程度）",
  "focus_trend": "集中度の推移と傾向（150文字程度）",
  "distraction_summary": "脱線パターンの分析（150文字程度）",
  "time_distribution": {
    "productive_time": 生産的な作業の割合（0-100の数値）,
    "distracted_time": 脱線の割合（0-100の数値）,
    "neutral_time": 中立的な作業の割合（0-100の数値）
  },
  "key_findings": ["重要な発見1（100文字程度）", "重要な発見2（100文字程度）", "重要な発見3（100文字程度）"],
  "recommendations": ["改善提案1（100文字程度）", "改善提案2（100文字程度）"],
  "overall_score": 総合評価スコア（0-100の数値）
}

必ず有効なJSONのみを返してください。余計な説明文は不要です。
`
}

// ---- 日報 ----------------------------------------------------------------------

export interface DailySourceLog {
  timestamp: string
  activity: string
  category: string
  details: string
  work_category?: string
  applications?: string[]
  focus_score?: number
}

export interface TimelineItem {
  time: string
  activity: string
  detail: string
}

export interface DailyReportData {
  date: string
  summary: string
  timeline: TimelineItem[]
  achievements: string[]
  tools_used: string[]
  blockers: string[]
  tomorrow: string[]
  markdown: string
}

export const DAILY_REPORT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    timeline: {
      type: "array",
      items: {
        type: "object",
        properties: { time: { type: "string" }, activity: { type: "string" }, detail: { type: "string" } },
        required: ["time", "activity", "detail"],
      },
    },
    achievements: { type: "array", items: { type: "string" } },
    tools_used: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" } },
    tomorrow: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "timeline", "achievements", "tools_used", "blockers", "tomorrow"],
}

/** 日報に載せるログの上限（プロンプト量を抑える）。超過分は1日全体から均等に間引く */
export const DAILY_REPORT_MAX_LOGS = 60

export function sampleDailyLogs<T extends { timestamp: string }>(logs: T[]): { logs: T[]; totalCount: number } {
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const totalCount = sorted.length
  if (sorted.length <= DAILY_REPORT_MAX_LOGS) return { logs: sorted, totalCount }
  const stride = sorted.length / DAILY_REPORT_MAX_LOGS
  const sampled = Array.from({ length: DAILY_REPORT_MAX_LOGS }, (_, i) => sorted[Math.floor(i * stride)])
  // 最終ログ（終業時刻側）は必ず含める
  sampled[sampled.length - 1] = sorted[sorted.length - 1]
  return { logs: sampled, totalCount }
}

export const formatLogTime = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone })

// 構造化データから提出用 Markdown を決定的に組み立てる
// （AI に Markdown まで書かせると構造とズレるため、こちらで生成する）
export function buildDailyMarkdown(report: Omit<DailyReportData, "markdown">): string {
  const lines: string[] = [`# 日報 ${report.date}`, ""]
  if (report.summary) lines.push("## サマリー", report.summary, "")
  if (report.timeline.length > 0) {
    lines.push("## タイムライン")
    report.timeline.forEach((item) => lines.push(`- ${item.time} ${item.activity}${item.detail ? ` — ${item.detail}` : ""}`))
    lines.push("")
  }
  if (report.achievements.length > 0) {
    lines.push("## 本日の成果")
    report.achievements.forEach((a) => lines.push(`- ${a}`))
    lines.push("")
  }
  if (report.tools_used.length > 0) lines.push("## 使用ツール", report.tools_used.join(", "), "")
  if (report.blockers.length > 0) {
    lines.push("## 詰まった点・課題")
    report.blockers.forEach((b) => lines.push(`- ${b}`))
    lines.push("")
  }
  if (report.tomorrow.length > 0) {
    lines.push("## 明日の予定")
    report.tomorrow.forEach((item) => lines.push(`- ${item}`))
    lines.push("")
  }
  return lines.join("\n").trim()
}

// AI が使えない場合でも、ログから機械的に日報の骨組みを作る
export function generateFallbackDailyReport(
  logs: DailySourceLog[],
  date: string,
  totalCount: number = logs.length,
  timeZone = "Asia/Tokyo",
): DailyReportData {
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const timeline: TimelineItem[] = sorted.map((log) => ({
    time: formatLogTime(log.timestamp, timeZone),
    activity: log.activity || "作業",
    detail: (log.details || "").slice(0, 80),
  }))
  const tools = [...new Set(sorted.flatMap((l) => l.applications || []))].filter(Boolean)
  const productiveActivities = [...new Set(sorted.filter((l) => l.category === "productive").map((l) => l.activity))]
  const distracted = sorted.filter((l) => l.category === "distracted").length

  const summary =
    `本日は${totalCount}件の作業記録がありました。` +
    `主な作業: ${productiveActivities.slice(0, 3).join("、") || sorted[0]?.activity || "-"}。` +
    (distracted > 0 ? `脱線の記録が${distracted}件ありました。` : "集中して作業できました。")

  const base = { date, summary, timeline, achievements: productiveActivities.slice(0, 5), tools_used: tools, blockers: [], tomorrow: [] }
  return { ...base, markdown: buildDailyMarkdown(base) }
}

export function normalizeDailyReport(
  raw: any,
  logs: DailySourceLog[],
  date: string,
  totalCount: number = logs.length,
  timeZone = "Asia/Tokyo",
): DailyReportData {
  const fallback = generateFallbackDailyReport(logs, date, totalCount, timeZone)
  const str = (v: any, def: string) => (typeof v === "string" && v.trim() ? v : def)
  const strArray = (v: any, def: string[]) => {
    if (!Array.isArray(v)) return def
    return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
  }

  let timeline: TimelineItem[] = fallback.timeline
  if (Array.isArray(raw?.timeline)) {
    const parsed = raw.timeline
      .filter((item: any) => item && typeof item === "object")
      .map((item: any) => ({ time: str(item.time, ""), activity: str(item.activity, ""), detail: str(item.detail, "") }))
      .filter((item: TimelineItem) => item.activity)
    if (parsed.length > 0) timeline = parsed
  }

  const base = {
    date,
    summary: str(raw?.summary, fallback.summary),
    timeline,
    achievements: strArray(raw?.achievements, fallback.achievements),
    tools_used: strArray(raw?.tools_used, fallback.tools_used),
    blockers: strArray(raw?.blockers, fallback.blockers),
    tomorrow: strArray(raw?.tomorrow, fallback.tomorrow),
  }
  return { ...base, markdown: buildDailyMarkdown(base) }
}

export function buildDailyReportPrompt(logs: DailySourceLog[], reportDate: string, timeZone: string, lang: "ja" | "en"): string {
  const logLines = logs
    .map((log) => {
      const time = formatLogTime(log.timestamp, timeZone)
      const apps = log.applications?.length ? ` [使用アプリ: ${log.applications.join(", ")}]` : ""
      return `- ${time} 【${log.activity}】(${log.category}${log.work_category ? `/${log.work_category}` : ""}) ${(log.details || "").slice(0, 120)}${apps}`
    })
    .join("\n")
  const outputLang = lang === "en" ? "英語" : "日本語"

  return `
あなたは業務日報の作成アシスタントです。以下は${reportDate}の作業記録（画面解析による自動ログ）です。
これをもとに、上司やチームにそのまま提出できる日報を作成してください。

【作業記録】
${logLines}

作成のルール:
- タイムラインは連続する同種の作業をまとめ、5〜10項目程度に整理する（1件ずつ羅列しない）
- 成果は「何をどこまで進めたか」が伝わる表現にする
- 脱線(distracted)の記録は日報には書かず、blockers には作業上の課題のみを書く
- 記録から読み取れないことは創作しない。tomorrow は記録から自然に推測できる場合のみ書く（なければ空配列）
- すべて${outputLang}で書く

以下のJSON形式のみで回答してください（余計な説明は不要）:
{
  "summary": "本日の作業の要約（2〜3文、丁寧語）",
  "timeline": [{"time": "09:00〜10:30", "activity": "作業名", "detail": "具体的にやったこと（40文字程度）"}],
  "achievements": ["成果1", "成果2"],
  "tools_used": ["ツール名"],
  "blockers": ["詰まった点・課題（なければ空配列）"],
  "tomorrow": ["明日の予定（記録から推測できる場合のみ）"]
}
`
}
