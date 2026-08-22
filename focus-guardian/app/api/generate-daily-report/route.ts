import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// クライアントが model を指定しなかった場合のフォールバック既定モデル。
// 既定を Gemini 系へ切り替えるかはプロダクト判断のため、ここでは変更しない
const DEFAULT_REPORT_MODEL = "gemma-4-26b-a4b-it"

// URLのパス断片に埋め込むため、モデルIDとして妥当な文字列だけを通す
const isValidModelId = (m: unknown): m is string =>
  typeof m === "string" && /^[a-zA-Z0-9._-]+$/.test(m)
const MAX_RETRIES = 3
const MAX_LOGS = 60 // トークン量を抑えるための上限

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  let lastResponse: Response | null = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = 1000 * Math.pow(2, attempt - 1)
      console.warn(`[Report] 500 error on attempt ${attempt}, retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    const response = await fetch(url, options)
    if (response.status !== 500) return response
    lastResponse = response
  }
  return lastResponse!
}

interface WorkLogEntry {
  timestamp: string
  activity: string
  category: string
  details: string
  work_category?: string
  applications?: string[]
  focus_score?: number
}

interface TimelineItem {
  time: string
  activity: string
  detail: string
}

interface DailyReportData {
  date: string
  summary: string
  timeline: TimelineItem[]
  achievements: string[]
  tools_used: string[]
  blockers: string[]
  tomorrow: string[]
  markdown: string
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })

// 構造化データから提出用Markdownを決定的に組み立てる
// （AIにMarkdownまで書かせると構造とズレるため、サーバー側で生成する）
function buildMarkdown(report: Omit<DailyReportData, "markdown">): string {
  const lines: string[] = [`# 日報 ${report.date}`, ""]

  if (report.summary) {
    lines.push("## サマリー", report.summary, "")
  }

  if (report.timeline.length > 0) {
    lines.push("## タイムライン")
    report.timeline.forEach((item) => {
      lines.push(`- ${item.time} ${item.activity}${item.detail ? ` — ${item.detail}` : ""}`)
    })
    lines.push("")
  }

  if (report.achievements.length > 0) {
    lines.push("## 本日の成果")
    report.achievements.forEach((a) => lines.push(`- ${a}`))
    lines.push("")
  }

  if (report.tools_used.length > 0) {
    lines.push("## 使用ツール", report.tools_used.join(", "), "")
  }

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

// AIが使えない場合でも、ログから機械的に日報の骨組みを作る
// totalCount: 間引き前の実ログ件数（サマリーの件数表示に使う）
function generateFallbackReport(logs: WorkLogEntry[], date: string, totalCount: number = logs.length): DailyReportData {
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const timeline: TimelineItem[] = sorted.map((log) => ({
    time: formatTime(log.timestamp),
    activity: log.activity || "作業",
    detail: (log.details || "").slice(0, 80),
  }))

  const tools = [...new Set(sorted.flatMap((l) => l.applications || []))].filter(Boolean)
  const productiveActivities = [...new Set(sorted.filter((l) => l.category === "productive").map((l) => l.activity))]
  const productive = sorted.filter((l) => l.category === "productive").length
  const distracted = sorted.filter((l) => l.category === "distracted").length

  const summary =
    `本日は${totalCount}件の作業記録がありました。` +
    `主な作業: ${productiveActivities.slice(0, 3).join("、") || sorted[0]?.activity || "-"}。` +
    (distracted > 0 ? `脱線の記録が${distracted}件ありました。` : "集中して作業できました。")

  const base = {
    date,
    summary,
    timeline,
    achievements: productiveActivities.slice(0, 5),
    tools_used: tools,
    blockers: [],
    tomorrow: [],
  }

  return { ...base, markdown: buildMarkdown(base) }
}

// Gemmaの応答は形式が保証されないため、必須フィールドを補完する
function normalizeDailyReport(raw: any, logs: WorkLogEntry[], date: string, totalCount: number = logs.length): DailyReportData {
  const fallback = generateFallbackReport(logs, date, totalCount)
  const str = (v: any, def: string) => (typeof v === "string" && v.trim() ? v : def)
  const strArray = (v: any, def: string[]) => {
    if (!Array.isArray(v)) return def
    const arr = v.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    return arr
  }

  let timeline: TimelineItem[] = fallback.timeline
  if (Array.isArray(raw?.timeline)) {
    const parsed = raw.timeline
      .filter((item: any) => item && typeof item === "object")
      .map((item: any) => ({
        time: str(item.time, ""),
        activity: str(item.activity, ""),
        detail: str(item.detail, ""),
      }))
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

  return { ...base, markdown: buildMarkdown(base) }
}

export async function POST(request: NextRequest) {
  try {
    // ログイン済みユーザーのみ利用可能
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {
              // Server Componentからの書き込みエラーは無視
            }
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized: ログインが必要です" }, { status: 401 })
    }

    const { workLogs, apiKey, date, model } = await request.json()
    if (!Array.isArray(workLogs)) {
      return NextResponse.json({ error: "workLogs must be an array" }, { status: 400 })
    }
    // 設定画面で選んだモデルを尊重する（未指定時はこれまで通り既定モデル）
    const reportModel = isValidModelId(model) ? model : DEFAULT_REPORT_MODEL

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    if (!Array.isArray(workLogs) || workLogs.length === 0) {
      return NextResponse.json({ error: "At least 1 work log is required" }, { status: 400 })
    }

    const reportDate: string =
      typeof date === "string" && date.trim()
        ? date
        : new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })

    // 古い順に並べる
    const sortedLogs: WorkLogEntry[] = [...workLogs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    const totalCount = sortedLogs.length

    // 上限超過時は末尾を切り出すのではなく、1日全体から均等に間引く
    // （末尾のみ残すと短いキャプチャ間隔の日に午前の作業が日報から丸ごと欠落するため）
    let logs: WorkLogEntry[] = sortedLogs
    if (sortedLogs.length > MAX_LOGS) {
      const stride = sortedLogs.length / MAX_LOGS
      logs = Array.from({ length: MAX_LOGS }, (_, i) => sortedLogs[Math.floor(i * stride)])
      // 最終ログ（終業時刻側）は必ず含める
      logs[logs.length - 1] = sortedLogs[sortedLogs.length - 1]
    }

    // Gemmaでリッチな日報を試みる
    try {
      const logLines = logs
        .map((log) => {
          const time = formatTime(log.timestamp)
          const apps = log.applications?.length ? ` [使用アプリ: ${log.applications.join(", ")}]` : ""
          return `- ${time} 【${log.activity}】(${log.category}${log.work_category ? `/${log.work_category}` : ""}) ${(log.details || "").slice(0, 120)}${apps}`
        })
        .join("\n")

      const prompt = `
あなたは業務日報の作成アシスタントです。以下は${reportDate}の作業記録（画面解析による自動ログ）です。
これをもとに、上司やチームにそのまま提出できる日報を作成してください。

【作業記録】
${logLines}

作成のルール:
- タイムラインは連続する同種の作業をまとめ、5〜10項目程度に整理する（1件ずつ羅列しない）
- 成果は「何をどこまで進めたか」が伝わる表現にする
- 脱線(distracted)の記録は日報には書かず、blockers には作業上の課題のみを書く
- 記録から読み取れないことは創作しない。tomorrow は記録から自然に推測できる場合のみ書く（なければ空配列）
- すべて日本語で書く

以下のJSON形式のみで回答してください（余計な説明は不要）:
{
  "summary": "本日の作業の要約（2〜3文、である調ではなく丁寧語）",
  "timeline": [
    {"time": "09:00〜10:30", "activity": "作業名", "detail": "具体的にやったこと（40文字程度）"}
  ],
  "achievements": ["成果1", "成果2"],
  "tools_used": ["ツール名"],
  "blockers": ["詰まった点・課題（なければ空配列）"],
  "tomorrow": ["明日の予定（記録から推測できる場合のみ）"]
}
`

      // APIキーはURLクエリではなくヘッダーで送る（ログへの漏えい面を減らす）
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${reportModel}:generateContent`

      const response = await fetchWithRetry(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (generatedText) {
          let jsonText = generatedText.trim()
          if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "")
          } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/```\n?/g, "")
          }
          // モデルが前置き文をつけてもJSON本体を拾えるよう、最初の{から最後の}までを抽出
          const braceMatch = jsonText.match(/\{[\s\S]*\}/)
          if (braceMatch) jsonText = braceMatch[0]
          const raw = JSON.parse(jsonText)
          console.log(`✅ Daily report generated successfully (${reportModel})`)
          return NextResponse.json(normalizeDailyReport(raw, logs, reportDate, totalCount))
        }
      } else {
        console.warn(`Report model ${reportModel} returned ${response.status}, falling back to local daily report`)
      }
    } catch (gemmaError) {
      console.warn(`Report model ${reportModel} failed, using fallback daily report:`, gemmaError)
    }

    // Gemma失敗時はログから機械的に日報を生成
    console.log("📊 Generating fallback daily report from log data...")
    return NextResponse.json(generateFallbackReport(logs, reportDate, totalCount))
  } catch (error) {
    console.error("Daily report generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate daily report" },
      { status: 500 },
    )
  }
}
