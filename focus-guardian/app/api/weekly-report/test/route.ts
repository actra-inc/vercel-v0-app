import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/server-auth"
import { last7DaysRange, safeTimeZone } from "@/lib/log-stats"
import {
  buildWeeklyDigest,
  buildSubject,
  buildEmailHtml,
  buildSlackText,
  sendWeeklyEmail,
  sendWeeklySlack,
  isValidSlackWebhookUrl,
} from "@/lib/weekly-report"

// テスト送信: 本人のセッション（RLS）で直近7日ぶんを集計し、
// 設定どおりのチャネルへ即時配信する。service role は使わない
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function POST() {
  const { user, supabase } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("capture_interval, gemini_api_key, weekly_report")
    .eq("user_id", user.id)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: "settings_fetch_failed" }, { status: 503 })
  }

  const wr = (settings?.weekly_report ?? {}) as {
    channel?: string
    slackWebhookUrl?: string
    timezone?: string
  }
  const channel = wr.channel === "slack" || wr.channel === "both" ? wr.channel : "email"
  const tz = safeTimeZone(wr.timezone)

  const now = new Date()
  const range = last7DaysRange(now, tz)
  const prevRange = last7DaysRange(new Date(now.getTime() - WEEK_MS), tz)

  let digest
  try {
    digest = await buildWeeklyDigest(supabase, user.id, settings ?? {}, range, prevRange)
  } catch (e) {
    console.error("Weekly digest build failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "digest_failed" }, { status: 500 })
  }

  const result: { emailSent: boolean; slackSent: boolean; errors: string[] } = {
    emailSent: false,
    slackSent: false,
    errors: [],
  }

  if (channel === "email" || channel === "both") {
    const r = await sendWeeklyEmail(user.email ?? "", buildSubject(digest), buildEmailHtml(digest))
    result.emailSent = r.ok
    if (!r.ok) result.errors.push(r.reason === "missing_api_key" ? "no_email_key" : "email_failed")
  }
  if (channel === "slack" || channel === "both") {
    if (!isValidSlackWebhookUrl(wr.slackWebhookUrl)) {
      result.errors.push("no_slack_url")
    } else {
      const r = await sendWeeklySlack(wr.slackWebhookUrl, buildSlackText(digest))
      result.slackSent = r.ok
      if (!r.ok) result.errors.push("slack_failed")
    }
  }

  return NextResponse.json(result)
}
