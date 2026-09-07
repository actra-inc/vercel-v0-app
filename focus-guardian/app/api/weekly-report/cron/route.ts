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
  normalizeReportLanguage,
} from "@/lib/weekly-report"

// 実行時間の上限（秒）。vercel.json の functions グロブは App Router の出力パスに
// 一致しない可能性があるため、Next.js 公式のルートセグメント設定で明示する。
// 1ユーザーあたり AIコメント（最大10秒）＋配信（最大10秒）の待ちが発生し得るため
// 他ルートより長めに取り、DEADLINE_MS で手前に新規着手を止める
export const maxDuration = 60

// 週次レポートの定期配信（Vercel Cron から毎週月曜 0:00 UTC に呼ばれる）。
// ユーザーセッションが無いため service role で読む。このルート以外で
// service role を使ってはならない
const MAX_USERS_PER_RUN = 50
// 同時処理数。Resend の既定レート制限（2 req/s）を超えないよう控えめにする。
// Gemini キーはユーザーごとに別なので、並列にしても1キーの無料枠には集中しない
const CONCURRENCY = 4
// これを過ぎたら新しいユーザーに着手しない（着手済みは完了させる）。
// maxDuration で強制終了されると途中経過すら返せないため、余裕を持たせる
const DEADLINE_MS = 40_000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

type Outcome = "sent" | "failed" | "not_applicable"

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
  const startedAt = Date.now()
  let sent = 0
  let failed = 0
  let skipped = 0

  const processUser = async (row: NonNullable<typeof rows>[number]): Promise<Outcome> => {
    const wr = (row.weekly_report ?? {}) as {
      enabled?: boolean
      channel?: string
      slackWebhookUrl?: string
      timezone?: string
      language?: string
    }
    if (wr.enabled !== true) return "not_applicable"
    const channel = wr.channel === "slack" || wr.channel === "both" ? wr.channel : "email"
    const tz = safeTimeZone(wr.timezone)
    const lang = normalizeReportLanguage(wr.language)

    const range = lastWeekRange(now, tz)
    const prevRange = lastWeekRange(new Date(now.getTime() - WEEK_MS), tz)
    const digest = await buildWeeklyDigest(admin, row.user_id, row, range, prevRange, lang)

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
    return delivered ? "sent" : "failed"
  }

  // 固定数のワーカーがキューを消化する。1ユーザーの失敗で全体を止めない
  const queue = [...(rows ?? [])]
  const worker = async () => {
    while (queue.length > 0) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        skipped += queue.length
        queue.length = 0
        return
      }
      const row = queue.shift()
      if (!row) return
      try {
        const outcome = await processUser(row)
        if (outcome === "sent") sent++
        else if (outcome === "failed") failed++
      } catch (e) {
        console.error("Weekly report failed for a user:", e instanceof Error ? e.message : e)
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()))

  if (skipped > 0) {
    // 次回実行（翌週）まで届かないユーザーが出たことを運用側が気付けるようにする
    console.warn(`Weekly report: ${skipped} user(s) skipped because the time budget ran out`)
  }
  return NextResponse.json({ sent, failed, skipped })
}
