import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase-admin"
import { lastWeekRange, safeTimeZone } from "@/lib/log-stats"
import {
  buildWeeklyDigest,
  buildSubject,
  buildEmailHtml,
  buildSlackText,
  sendWeeklyEmail,
  sendWeeklySlack,
  isValidSlackWebhookUrl,
} from "@/lib/weekly-report"

// 実行時間の上限（秒）。vercel.json の functions グロブは App Router の出力パスに
// 一致しない可能性があるため、Next.js 公式のルートセグメント設定で明示する
// （Gemini/Gemma の待ち・リトライが既定上限を超えてタイムアウトしないように）
export const maxDuration = 30

// 週次レポートの定期配信（Vercel Cron から毎週月曜 0:00 UTC に呼ばれる）。
// ユーザーセッションが無いため service role で読む。このルート以外で
// service role を使ってはならない
const MAX_USERS_PER_RUN = 50
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function GET(request: Request) {
  // Vercel Cron は CRON_SECRET 環境変数を設定すると
  // Authorization: Bearer <CRON_SECRET> を自動で付ける
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let admin
  try {
    admin = getAdminClient()
  } catch {
    // キーの値は出さない
    return NextResponse.json({ error: "Server is not configured for weekly reports" }, { status: 500 })
  }

  // 配信オンのユーザーだけを列挙する
  const { data: rows, error } = await admin
    .from("user_settings")
    .select("user_id, capture_interval, gemini_api_key, weekly_report")
    .eq("weekly_report->>enabled", "true")
    .limit(MAX_USERS_PER_RUN)

  if (error) {
    console.error("Failed to list weekly-report users:", error.message)
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 })
  }

  const now = new Date()
  let sent = 0
  let failed = 0

  for (const row of rows ?? []) {
    try {
      const wr = (row.weekly_report ?? {}) as {
        enabled?: boolean
        channel?: string
        slackWebhookUrl?: string
        timezone?: string
      }
      if (wr.enabled !== true) continue
      const channel = wr.channel === "slack" || wr.channel === "both" ? wr.channel : "email"
      const tz = safeTimeZone(wr.timezone)

      const range = lastWeekRange(now, tz)
      const prevRange = lastWeekRange(new Date(now.getTime() - WEEK_MS), tz)
      const digest = await buildWeeklyDigest(admin, row.user_id, row, range, prevRange)

      let delivered = false
      if (channel === "email" || channel === "both") {
        const { data: userRow } = await admin
          .from("users")
          .select("email")
          .eq("id", row.user_id)
          .maybeSingle()
        if (userRow?.email) {
          const r = await sendWeeklyEmail(userRow.email, buildSubject(digest), buildEmailHtml(digest))
          delivered = delivered || r.ok
        }
      }
      if (channel === "slack" || channel === "both") {
        if (isValidSlackWebhookUrl(wr.slackWebhookUrl)) {
          const r = await sendWeeklySlack(wr.slackWebhookUrl, buildSlackText(digest))
          delivered = delivered || r.ok
        }
      }

      if (delivered) sent++
      else failed++
    } catch (e) {
      // 1ユーザーの失敗で全体を止めない
      console.error("Weekly report failed for a user:", e instanceof Error ? e.message : e)
      failed++
    }
  }

  return NextResponse.json({ sent, failed })
}
