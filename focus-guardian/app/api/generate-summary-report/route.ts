import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { workLogs, apiKey, model } = await request.json()

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    if (!workLogs || workLogs.length < 3) {
      return NextResponse.json({ error: "At least 3 work logs are required" }, { status: 400 })
    }

    // 直近3件のログから情報を抽出
    const recentLogs = workLogs.slice(0, 3)

    // Gemini APIに送信するプロンプトを作成
    const prompt = `
以下は直近3件の作業ログです。これらを統合分析して、包括的なレポートを生成してください。

【作業ログ1】
- 時刻: ${new Date(recentLogs[0].timestamp).toLocaleString("ja-JP")}
- 活動: ${recentLogs[0].activity}
- カテゴリ: ${recentLogs[0].category}
- 詳細: ${recentLogs[0].details}
- 集中度スコア: ${recentLogs[0].focus_score || 0}/100
${recentLogs[0].distraction_check ? `- 脱線検知: ${recentLogs[0].distraction_check.is_distracted ? "あり" : "なし"}` : ""}

【作業ログ2】
- 時刻: ${new Date(recentLogs[1].timestamp).toLocaleString("ja-JP")}
- 活動: ${recentLogs[1].activity}
- カテゴリ: ${recentLogs[1].category}
- 詳細: ${recentLogs[1].details}
- 集中度スコア: ${recentLogs[1].focus_score || 0}/100
${recentLogs[1].distraction_check ? `- 脱線検知: ${recentLogs[1].distraction_check.is_distracted ? "あり" : "なし"}` : ""}

【作業ログ3】
- 時刻: ${new Date(recentLogs[2].timestamp).toLocaleString("ja-JP")}
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

    // Gemini API呼び出し
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Gemini API error:", errorText)
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json()
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!generatedText) {
      throw new Error("No response from Gemini API")
    }

    // JSONを抽出（マークダウンコードブロックを削除）
    let jsonText = generatedText.trim()
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "")
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/g, "")
    }

    const reportData = JSON.parse(jsonText)

    return NextResponse.json(reportData)
  } catch (error) {
    console.error("Report generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate report" },
      { status: 500 },
    )
  }
}
