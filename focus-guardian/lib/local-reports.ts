// まとめレポート・日報を端末内 AI で生成する（クライアント専用）。
// モデルが使えない・応答が壊れている場合は、ログからの機械的なレポートに落とす
// （旧サーバールートと同じ二段構え）。

import { extractJsonObject, runLocalPrompt } from "@/lib/local-ai"
import {
  DAILY_REPORT_SCHEMA,
  SUMMARY_REPORT_SCHEMA,
  buildDailyReportPrompt,
  buildSummaryReportPrompt,
  generateFallbackDailyReport,
  generateFallbackSummaryReport,
  normalizeDailyReport,
  normalizeSummaryReport,
  sampleDailyLogs,
  type DailyReportData,
  type DailySourceLog,
  type SummaryReportData,
  type SummarySourceLog,
} from "@/lib/report-builders"

const REPORT_TIMEOUT_MS = 90_000

function resolveTimeZone(tz?: string): string {
  if (tz) {
    try {
      new Intl.DateTimeFormat("ja-JP", { timeZone: tz })
      return tz
    } catch {
      /* 不正なタイムゾーン名は既定へ */
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo"
}

/** 直近3件のまとめレポート。logs は新しい順でも古い順でもよい（時系列に並べ直す） */
export async function generateSummaryReportLocal(
  logs: SummarySourceLog[],
  lang: "ja" | "en",
  timeZone?: string,
): Promise<SummaryReportData> {
  const tz = resolveTimeZone(timeZone)
  const recent = logs
    .slice(0, 3)
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  if (recent.length < 3) throw new Error("At least 3 work logs are required")

  try {
    const text = await runLocalPrompt({
      lang,
      text: buildSummaryReportPrompt(recent, tz, lang),
      schema: SUMMARY_REPORT_SCHEMA,
      timeoutMs: REPORT_TIMEOUT_MS,
    })
    const raw = extractJsonObject(text)
    if (raw) return normalizeSummaryReport(raw, recent, lang)
    console.warn("Local summary report: could not parse model output; using fallback")
  } catch (e) {
    console.warn("Local summary report failed; using fallback:", e instanceof Error ? e.message : e)
  }
  return generateFallbackSummaryReport(recent, lang)
}

/** 1日分の日報。logs は当日ぶん全件（内部で最大60件に間引く） */
export async function generateDailyReportLocal(
  logs: DailySourceLog[],
  reportDate: string,
  lang: "ja" | "en",
  timeZone?: string,
): Promise<DailyReportData> {
  const tz = resolveTimeZone(timeZone)
  if (logs.length === 0) throw new Error("At least 1 work log is required")
  const { logs: sampled, totalCount } = sampleDailyLogs(logs)

  try {
    const text = await runLocalPrompt({
      lang,
      text: buildDailyReportPrompt(sampled, reportDate, tz, lang),
      schema: DAILY_REPORT_SCHEMA,
      timeoutMs: REPORT_TIMEOUT_MS,
    })
    const raw = extractJsonObject(text)
    if (raw) return normalizeDailyReport(raw, sampled, reportDate, totalCount, tz, lang)
    console.warn("Local daily report: could not parse model output; using fallback")
  } catch (e) {
    console.warn("Local daily report failed; using fallback:", e instanceof Error ? e.message : e)
  }
  return generateFallbackDailyReport(sampled, reportDate, totalCount, tz, lang)
}
