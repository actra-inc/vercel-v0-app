import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeWeeklyStats,
  formatSeconds,
  type WeekRange,
  type WeeklyStats,
} from "@/lib/log-stats"

// 週次レポートの生成と配信（cron・テスト送信の共通処理）。
// メール・Slack本文には集計値とAI生成コメントのみを載せる
// （ログの生テキストやスクリーンショットURLは平文経路のため含めない）

const REPORT_MODEL = "gemma-4-26b-a4b-it" // 既存レポート系と同じ（解析モデルと無料枠を分離）
const AI_TIMEOUT_MS = 10_000

export type ReportLanguage = "ja" | "en"

/** 設定に保存された言語を検証する（未設定・不正値は日本語） */
export const normalizeReportLanguage = (value: unknown): ReportLanguage => (value === "en" ? "en" : "ja")

export interface WeeklyDigest {
  range: WeekRange
  stats: WeeklyStats
  prevStats: WeeklyStats
  aiComment: string | null
  lang: ReportLanguage
}

interface DigestUserSettings {
  capture_interval?: number | null
  gemini_api_key?: string | null
}

// 本文の文言。UI言語は端末側（localStorage）にしか無いため、
// 設定保存時・言語切替時に weekly_report.language として同期された値で選ぶ
const TEXT = {
  ja: {
    subject: (from: string, to: string) => `FlowNudge 週次レポート（${from}〜${to}）`,
    title: "FlowNudge 週次レポート",
    rangeSuffix: (from: string, to: string) => `（${from}〜${to}）`,
    rangeSep: " 〜 ",
    total: "合計作業時間",
    avgFocus: "平均集中度",
    productive: "生産的ログの割合",
    distracted: "脱線",
    times: (n: number) => `${n}回`,
    mainly: (list: string) => `（主に ${list}）`,
    breakdownHeading: "作業種類の内訳",
    breakdownLabel: "内訳:",
    sameAsLastWeek: "（先週と同じ）",
    vsLastWeek: (signed: string) => `（先週比 ${signed}）`,
    points: "点",
    listSep: "、",
    footer:
      "このメールはFlowNudgeの週次レポート配信設定により送信されています。配信停止はアプリの設定 &gt; その他 から行えます。",
  },
  en: {
    subject: (from: string, to: string) => `FlowNudge weekly report (${from} to ${to})`,
    title: "FlowNudge weekly report",
    rangeSuffix: (from: string, to: string) => ` (${from} to ${to})`,
    rangeSep: " to ",
    total: "Total work time",
    avgFocus: "Average focus",
    productive: "Productive logs",
    distracted: "Distractions",
    times: (n: number) => `${n}`,
    mainly: (list: string) => ` (mainly ${list})`,
    breakdownHeading: "Breakdown by work type",
    breakdownLabel: "Breakdown:",
    sameAsLastWeek: "(same as last week)",
    vsLastWeek: (signed: string) => `(${signed} vs last week)`,
    points: " pts",
    listSep: ", ",
    footer:
      "You are receiving this email because weekly report delivery is enabled in FlowNudge. To stop, open the app's Settings &gt; Other.",
  },
} as const

// 既定カテゴリはDBに日本語名で保存されている（画面側も同じ対応表で表示名に変換する:
// components/activity-breakdown.tsx の CAT_NAME_TO_KEY）。英語本文ではここで置き換える。
// ユーザーが自分で追加したカテゴリ名はそのまま載せる
const DEFAULT_CATEGORY_EN: Record<string, string> = {
  "メールチェック": "Email",
  "娯楽": "Entertainment",
  "チャット": "Chat",
  "リサーチ": "Research",
  "ミーティング": "Meeting",
  "業務以外のSNS": "Non-work SNS",
  "未分類": "Uncategorized",
  // computeWeeklyStats が活動名の無い脱線ログに付けるラベル
  "不明": "unknown",
}
const displayName = (name: string, lang: ReportLanguage) =>
  lang === "en" ? DEFAULT_CATEGORY_EN[name] ?? name : name

// supabase-js / @supabase/ssr のどちらのクライアントでも動く最小のクエリ形。
// cron は service role、テスト送信は本人セッション（RLS）で呼ばれる
export async function buildWeeklyDigest(
  client: SupabaseClient | any,
  userId: string,
  settings: DigestUserSettings,
  range: WeekRange,
  prevRange: WeekRange,
  lang: ReportLanguage = "ja",
): Promise<WeeklyDigest> {
  const captureInterval =
    typeof settings.capture_interval === "number" && settings.capture_interval > 0
      ? settings.capture_interval
      : 30

  const fetchRange = async (r: WeekRange) => {
    const { data, error } = await client
      .from("work_logs")
      .select("timestamp, category, work_category, activity, focus_score")
      .eq("user_id", userId)
      .gte("timestamp", r.from.toISOString())
      .lt("timestamp", r.to.toISOString())
      .is("report_type", null)
      .order("timestamp", { ascending: true })
      .limit(5000)
    if (error) throw new Error(`work_logs fetch failed: ${error.message}`)
    return data ?? []
  }

  const [logs, prevLogs] = await Promise.all([fetchRange(range), fetchRange(prevRange)])
  const stats = computeWeeklyStats(logs, captureInterval)
  const prevStats = computeWeeklyStats(prevLogs, captureInterval)

  let aiComment: string | null = null
  if (settings.gemini_api_key && stats.logCount > 0) {
    aiComment = await generateAiComment(settings.gemini_api_key, stats, prevStats, lang)
  }

  return { range, stats, prevStats, aiComment, lang }
}

function buildAiPrompt(stats: WeeklyStats, prevStats: WeeklyStats, lang: ReportLanguage): string {
  const t = TEXT[lang]
  const cats = stats.categorySeconds
    .map((c) => `${displayName(c.name, lang)}(${formatSeconds(c.seconds, lang)})`)
    .join(t.listSep)
  const dists = stats.topDistractions.map((d) => displayName(d.activity, lang)).join(t.listSep)
  if (lang === "en") {
    return `You are a work-log analysis assistant. Based on the weekly summary below, write a positive and specific reflection in English, 3 to 4 sentences. Do not list numbers or add headings; return only the body text.

This week: total ${formatSeconds(stats.totalSeconds, lang)} / ${stats.logCount} analyses / average focus ${stats.avgFocus ?? "n/a"} / productive ${stats.productivePct ?? "n/a"}% / ${stats.distractedCount} distractions
Last week: total ${formatSeconds(prevStats.totalSeconds, lang)} / average focus ${prevStats.avgFocus ?? "n/a"} / productive ${prevStats.productivePct ?? "n/a"}%
Main work types: ${cats || "none"}
Main distractions: ${dists || "none"}`
  }
  return `あなたは作業ログ分析アシスタントです。以下の1週間の集計から、前向きで具体的な振り返りコメントを日本語で3〜4文書いてください。数値の羅列や見出しは不要で、本文のみを返してください。

今週: 合計${formatSeconds(stats.totalSeconds)} / 解析${stats.logCount}件 / 平均集中度${stats.avgFocus ?? "不明"} / 生産的${stats.productivePct ?? "不明"}% / 脱線${stats.distractedCount}回
先週: 合計${formatSeconds(prevStats.totalSeconds)} / 平均集中度${prevStats.avgFocus ?? "不明"} / 生産的${prevStats.productivePct ?? "不明"}%
主な作業種類: ${cats || "なし"}
主な脱線先: ${dists || "なし"}`
}

// Gemma で3〜4文の振り返りコメントを作る。失敗しても配信は止めない
async function generateAiComment(
  apiKey: string,
  stats: WeeklyStats,
  prevStats: WeeklyStats,
  lang: ReportLanguage,
): Promise<string | null> {
  try {
    const prompt = buildAiPrompt(stats, prevStats, lang)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${REPORT_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      console.warn(`Weekly AI comment generation failed: HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    const text: unknown = data?.candidates?.[0]?.content?.parts?.[0]?.text
    return typeof text === "string" && text.trim() ? text.trim().slice(0, 1000) : null
  } catch (e) {
    console.warn("Weekly AI comment generation failed:", e instanceof Error ? e.message : e)
    return null
  }
}

// ---- 整形 -----------------------------------------------------------------

function deltaLabel(current: number | null, prev: number | null, unit: string, lang: ReportLanguage): string {
  if (current == null || prev == null) return ""
  const t = TEXT[lang]
  const diff = current - prev
  if (diff === 0) return t.sameAsLastWeek
  return t.vsLastWeek(diff > 0 ? `+${diff}${unit}` : `${diff}${unit}`)
}

function hoursDelta(currentSec: number, prevSec: number, lang: ReportLanguage): string {
  const diffMin = Math.round((currentSec - prevSec) / 60)
  if (prevSec === 0 || diffMin === 0) return ""
  const sign = diffMin > 0 ? "+" : "-"
  return TEXT[lang].vsLastWeek(`${sign}${formatSeconds(Math.abs(diffMin) * 60, lang)}`)
}

export function buildSubject(digest: WeeklyDigest): string {
  return TEXT[digest.lang].subject(digest.range.fromLabel, digest.range.toLabel)
}

// Slack は `<...>` をリンク/メンション、`&` をエンティティとして解釈するため、
// 集計由来の文字列（カテゴリ名・活動名・AIコメント）はエスケープしてから載せる
const slackEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export function buildSlackText(digest: WeeklyDigest): string {
  const { stats, prevStats, range, lang } = digest
  const t = TEXT[lang]
  const distractions =
    stats.topDistractions.length > 0
      ? t.mainly(stats.topDistractions.map((d) => slackEsc(displayName(d.activity, lang))).join(t.listSep))
      : ""
  const lines = [
    `📊 *${t.title}*${t.rangeSuffix(range.fromLabel, range.toLabel)}`,
    ``,
    `⏱ ${t.total}: ${formatSeconds(stats.totalSeconds, lang)} ${hoursDelta(stats.totalSeconds, prevStats.totalSeconds, lang)}`,
    `🎯 ${t.avgFocus}: ${stats.avgFocus ?? "-"} /100 ${deltaLabel(stats.avgFocus, prevStats.avgFocus, t.points, lang)}`,
    `✅ ${t.productive}: ${stats.productivePct ?? "-"}%`,
    `⚠️ ${t.distracted}: ${t.times(stats.distractedCount)}${distractions}`,
  ]
  if (stats.categorySeconds.length > 0) {
    lines.push(``, t.breakdownLabel)
    stats.categorySeconds.forEach((c) =>
      lines.push(`  • ${slackEsc(displayName(c.name, lang))}: ${formatSeconds(c.seconds, lang)}`),
    )
  }
  if (digest.aiComment) {
    lines.push(``, `💬 ${slackEsc(digest.aiComment)}`)
  }
  return lines.join("\n")
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function buildEmailHtml(digest: WeeklyDigest): string {
  const { stats, prevStats, range, lang } = digest
  const t = TEXT[lang]
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#6b7280;">${esc(label)}</td><td style="padding:6px 12px;font-weight:600;color:#111827;">${esc(value)}</td></tr>`

  const catRows = stats.categorySeconds
    .map((c) => row(displayName(c.name, lang), formatSeconds(c.seconds, lang)))
    .join("")
  const distractions =
    stats.topDistractions.length > 0
      ? t.mainly(stats.topDistractions.map((d) => displayName(d.activity, lang)).join(t.listSep))
      : ""

  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827;">
  <h2 style="color:#ea580c;">${esc(t.title)}</h2>
  <p style="color:#6b7280;">${esc(range.fromLabel)}${esc(t.rangeSep)}${esc(range.toLabel)}</p>
  <table style="border-collapse:collapse;background:#fff7ed;border-radius:8px;width:100%;">
    ${row(t.total, `${formatSeconds(stats.totalSeconds, lang)} ${hoursDelta(stats.totalSeconds, prevStats.totalSeconds, lang)}`)}
    ${row(t.avgFocus, `${stats.avgFocus ?? "-"} /100 ${deltaLabel(stats.avgFocus, prevStats.avgFocus, t.points, lang)}`)}
    ${row(t.productive, `${stats.productivePct ?? "-"}%`)}
    ${row(t.distracted, `${t.times(stats.distractedCount)}${distractions}`)}
  </table>
  ${catRows ? `<h3 style="margin-top:20px;">${esc(t.breakdownHeading)}</h3><table style="border-collapse:collapse;width:100%;">${catRows}</table>` : ""}
  ${digest.aiComment ? `<div style="margin-top:20px;padding:12px;background:#f0f9ff;border-radius:8px;">💬 ${esc(digest.aiComment)}</div>` : ""}
  <p style="margin-top:24px;font-size:12px;color:#9ca3af;">${t.footer}</p>
</div>`
}

// ---- 配信 -----------------------------------------------------------------

export type DeliveryResult = { ok: boolean; reason?: "missing_api_key" | "missing_target" | "http_error" }

export async function sendWeeklyEmail(to: string, subject: string, html: string): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, reason: "missing_api_key" }
  if (!to) return { ok: false, reason: "missing_target" }
  const from = process.env.WEEKLY_REPORT_FROM || "FlowNudge <onboarding@resend.dev>"
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // レスポンス本文にキーは含まれないが、念のためステータスのみログする
      console.error(`Resend API error: HTTP ${res.status}`)
      return { ok: false, reason: "http_error" }
    }
    return { ok: true }
  } catch (e) {
    console.error("Resend request failed:", e instanceof Error ? e.message : e)
    return { ok: false, reason: "http_error" }
  }
}

/** SSRF防止: Slackの正規Webhookホスト以外へは絶対にPOSTしない */
export const isValidSlackWebhookUrl = (url: unknown): url is string =>
  typeof url === "string" && url.startsWith("https://hooks.slack.com/")

export async function sendWeeklySlack(webhookUrl: string, text: string): Promise<DeliveryResult> {
  if (!isValidSlackWebhookUrl(webhookUrl)) return { ok: false, reason: "missing_target" }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error(`Slack webhook error: HTTP ${res.status}`)
      return { ok: false, reason: "http_error" }
    }
    return { ok: true }
  } catch (e) {
    console.error("Slack webhook request failed:", e instanceof Error ? e.message : e)
    return { ok: false, reason: "http_error" }
  }
}
