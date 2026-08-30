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

export interface WeeklyDigest {
  range: WeekRange
  stats: WeeklyStats
  prevStats: WeeklyStats
  aiComment: string | null
}

interface DigestUserSettings {
  capture_interval?: number | null
  gemini_api_key?: string | null
}

// supabase-js / @supabase/ssr のどちらのクライアントでも動く最小のクエリ形。
// cron は service role、テスト送信は本人セッション（RLS）で呼ばれる
export async function buildWeeklyDigest(
  client: SupabaseClient | any,
  userId: string,
  settings: DigestUserSettings,
  range: WeekRange,
  prevRange: WeekRange,
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
    aiComment = await generateAiComment(settings.gemini_api_key, stats, prevStats)
  }

  return { range, stats, prevStats, aiComment }
}

// Gemma で3〜4文の振り返りコメントを作る。失敗しても配信は止めない
async function generateAiComment(
  apiKey: string,
  stats: WeeklyStats,
  prevStats: WeeklyStats,
): Promise<string | null> {
  try {
    const prompt = `あなたは作業ログ分析アシスタントです。以下の1週間の集計から、前向きで具体的な振り返りコメントを日本語で3〜4文書いてください。数値の羅列や見出しは不要で、本文のみを返してください。

今週: 合計${formatSeconds(stats.totalSeconds)} / 解析${stats.logCount}件 / 平均集中度${stats.avgFocus ?? "不明"} / 生産的${stats.productivePct ?? "不明"}% / 脱線${stats.distractedCount}回
先週: 合計${formatSeconds(prevStats.totalSeconds)} / 平均集中度${prevStats.avgFocus ?? "不明"} / 生産的${prevStats.productivePct ?? "不明"}%
主な作業種類: ${stats.categorySeconds.map((c) => `${c.name}(${formatSeconds(c.seconds)})`).join("、") || "なし"}
主な脱線先: ${stats.topDistractions.map((d) => d.activity).join("、") || "なし"}`

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

function deltaLabel(current: number | null, prev: number | null, unit: string): string {
  if (current == null || prev == null) return ""
  const diff = current - prev
  if (diff === 0) return "（先週と同じ）"
  return diff > 0 ? `（先週比 +${diff}${unit}）` : `（先週比 ${diff}${unit}）`
}

function hoursDelta(currentSec: number, prevSec: number): string {
  const diffMin = Math.round((currentSec - prevSec) / 60)
  if (prevSec === 0 || diffMin === 0) return ""
  const sign = diffMin > 0 ? "+" : "-"
  return `（先週比 ${sign}${formatSeconds(Math.abs(diffMin) * 60)}）`
}

export function buildSubject(digest: WeeklyDigest): string {
  return `FlowNudge 週次レポート（${digest.range.fromLabel}〜${digest.range.toLabel}）`
}

export function buildSlackText(digest: WeeklyDigest): string {
  const { stats, prevStats, range } = digest
  const lines = [
    `📊 *FlowNudge 週次レポート*（${range.fromLabel}〜${range.toLabel}）`,
    ``,
    `⏱ 合計作業時間: ${formatSeconds(stats.totalSeconds)} ${hoursDelta(stats.totalSeconds, prevStats.totalSeconds)}`,
    `🎯 平均集中度: ${stats.avgFocus ?? "-"} /100 ${deltaLabel(stats.avgFocus, prevStats.avgFocus, "点")}`,
    `✅ 生産的ログの割合: ${stats.productivePct ?? "-"}%`,
    `⚠️ 脱線: ${stats.distractedCount}回${stats.topDistractions.length > 0 ? `（主に ${stats.topDistractions.map((d) => d.activity).join("、")}）` : ""}`,
  ]
  if (stats.categorySeconds.length > 0) {
    lines.push(``, `内訳:`)
    stats.categorySeconds.forEach((c) => lines.push(`  • ${c.name}: ${formatSeconds(c.seconds)}`))
  }
  if (digest.aiComment) {
    lines.push(``, `💬 ${digest.aiComment}`)
  }
  return lines.join("\n")
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function buildEmailHtml(digest: WeeklyDigest): string {
  const { stats, prevStats, range } = digest
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#6b7280;">${esc(label)}</td><td style="padding:6px 12px;font-weight:600;color:#111827;">${esc(value)}</td></tr>`

  const catRows = stats.categorySeconds
    .map((c) => row(c.name, formatSeconds(c.seconds)))
    .join("")

  return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111827;">
  <h2 style="color:#ea580c;">FlowNudge 週次レポート</h2>
  <p style="color:#6b7280;">${esc(range.fromLabel)} 〜 ${esc(range.toLabel)}</p>
  <table style="border-collapse:collapse;background:#fff7ed;border-radius:8px;width:100%;">
    ${row("合計作業時間", `${formatSeconds(stats.totalSeconds)} ${hoursDelta(stats.totalSeconds, prevStats.totalSeconds)}`)}
    ${row("平均集中度", `${stats.avgFocus ?? "-"} /100 ${deltaLabel(stats.avgFocus, prevStats.avgFocus, "点")}`)}
    ${row("生産的ログの割合", `${stats.productivePct ?? "-"}%`)}
    ${row("脱線", `${stats.distractedCount}回${stats.topDistractions.length > 0 ? `（主に ${stats.topDistractions.map((d) => d.activity).join("、")}）` : ""}`)}
  </table>
  ${catRows ? `<h3 style="margin-top:20px;">作業種類の内訳</h3><table style="border-collapse:collapse;width:100%;">${catRows}</table>` : ""}
  ${digest.aiComment ? `<div style="margin-top:20px;padding:12px;background:#f0f9ff;border-radius:8px;">💬 ${esc(digest.aiComment)}</div>` : ""}
  <p style="margin-top:24px;font-size:12px;color:#9ca3af;">このメールはFlowNudgeの週次レポート配信設定により送信されています。配信停止はアプリの設定 &gt; その他 から行えます。</p>
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
