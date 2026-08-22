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
  focus_score?: number
  distraction_check?: { is_distracted: boolean; reason: string }
}

function generateFallbackReport(logs: WorkLogEntry[]) {
  const total = logs.length
  const productive = logs.filter((l) => l.category === "productive").length
  const distracted = logs.filter((l) => l.category === "distracted").length
  const neutral = total - productive - distracted

  const productivePct = Math.round((productive / total) * 100)
  const distractedPct = Math.round((distracted / total) * 100)
  const neutralPct = 100 - productivePct - distractedPct

  const avgFocus = Math.round(
    logs.reduce((sum, l) => sum + (l.focus_score ?? 50), 0) / total
  )

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
  if (avgFocus < 60)
    recommendations.push("集中度向上のため、通知をオフにして作業専用の環境を作ることをお勧めします。")
  if (recommendations.length === 0)
    recommendations.push("現在のペースを維持して作業を続けましょう。定期的な休憩も忘れずに。")

  return {
    summary,
    productivity_analysis: productivityAnalysis,
    focus_trend: focusTrend,
    distraction_summary: distractionSummary,
    time_distribution: {
      productive_time: productivePct,
      distracted_time: distractedPct,
      neutral_time: neutralPct,
    },
    key_findings: keyFindings,
    recommendations,
    overall_score: avgFocus,
  }
}

// Gemmaの応答は形式が保証されないため、保存前に必須フィールドを補完する
// （欠損したままDBに保存されるとレポート表示側がクラッシュする）
function normalizeReportData(raw: any, logs: WorkLogEntry[]) {
  const fallback = generateFallbackReport(logs)
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

export async function POST(request: NextRequest) {
  try {
    // analyze-screenshot と同様にログイン済みユーザーのみ利用可能にする
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

    const { workLogs, apiKey, model } = await request.json()
    // 設定画面で選んだモデルを尊重する（未指定時はこれまで通り既定モデル）
    const reportModel = isValidModelId(model) ? model : DEFAULT_REPORT_MODEL

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    if (!workLogs || workLogs.length < 3) {
      return NextResponse.json({ error: "At least 3 work logs are required" }, { status: 400 })
    }

    // 細工されたボディで即500にならないよう配列を検証する
    if (!Array.isArray(workLogs) || workLogs.length === 0) {
      return NextResponse.json({ error: "workLogs must be a non-empty array" }, { status: 400 })
    }

    // クライアントは新しい順で送ってくるため、時系列（古い→新しい）に並べ直す。
    // 逆順のままだと「集中度の推移」が逆向きに分析される
    const recentLogs: WorkLogEntry[] = workLogs
      .slice(0, 3)
      .slice()
      .sort((a: WorkLogEntry, b: WorkLogEntry) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // まずGemmaでリッチなレポートを試みる
    try {
      const prompt = `
以下は直近3件の作業ログです。これらを統合分析して、包括的なレポートを生成してください。

【作業ログ1】
- 時刻: ${new Date(recentLogs[0].timestamp).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
- 活動: ${recentLogs[0].activity}
- カテゴリ: ${recentLogs[0].category}
- 詳細: ${recentLogs[0].details}
- 集中度スコア: ${recentLogs[0].focus_score || 0}/100
${recentLogs[0].distraction_check ? `- 脱線検知: ${recentLogs[0].distraction_check.is_distracted ? "あり" : "なし"}` : ""}

【作業ログ2】
- 時刻: ${new Date(recentLogs[1].timestamp).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
- 活動: ${recentLogs[1].activity}
- カテゴリ: ${recentLogs[1].category}
- 詳細: ${recentLogs[1].details}
- 集中度スコア: ${recentLogs[1].focus_score || 0}/100
${recentLogs[1].distraction_check ? `- 脱線検知: ${recentLogs[1].distraction_check.is_distracted ? "あり" : "なし"}` : ""}

【作業ログ3】
- 時刻: ${new Date(recentLogs[2].timestamp).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
- 活動: ${recentLogs[2].activity}
- カテゴリ: ${recentLogs[2].category}
- 詳細: ${recentLogs[2].details}
- 集中度スコア: ${recentLogs[2].focus_score || 0}/100
${recentLogs[2].distraction_check ? `- 脱線検知: ${recentLogs[2].distraction_check.is_distracted ? "あり" : "なし"}` : ""}

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
  "key_findings": [
    "重要な発見1（100文字程度）",
    "重要な発見2（100文字程度）",
    "重要な発見3（100文字程度）"
  ],
  "recommendations": [
    "改善提案1（100文字程度）",
    "改善提案2（100文字程度）"
  ],
  "overall_score": 総合評価スコア（0-100の数値）
}

必ず有効なJSONのみを返してください。余計な説明文は不要です。
`

      // APIキーはURLクエリではなくヘッダーで送る（ログへの漏えい面を減らす）
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${reportModel}:generateContent`

      const response = await fetchWithRetry(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 1.0,
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
          const reportData = JSON.parse(jsonText)
          console.log(`✅ Report generated successfully (${reportModel})`)
          return NextResponse.json(normalizeReportData(reportData, recentLogs))
        }
      } else {
        console.warn(`Report model ${reportModel} returned ${response.status}, falling back to local report`)
      }
    } catch (gemmaError) {
      console.warn(`Report model ${reportModel} failed, using fallback:`, gemmaError)
    }

    // Gemma失敗時はログデータからローカルでレポートを生成
    console.log("📊 Generating fallback report from log data...")
    return NextResponse.json(generateFallbackReport(recentLogs))
  } catch (error) {
    console.error("Report generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate report" },
      { status: 500 },
    )
  }
}
