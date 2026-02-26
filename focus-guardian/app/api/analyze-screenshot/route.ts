import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
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

    const formData = await request.formData()
    const screenshot = formData.get("screenshot") as File
    const apiKey = formData.get("apiKey") as string
    const currentTask = formData.get("currentTask") as string
    const model = "gemini-1.5-flash"

    if (!screenshot) {
      return NextResponse.json({ error: "Screenshot is required" }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    const bytes = await screenshot.arrayBuffer()
    const base64 = Buffer.from(bytes).toString("base64")
    const mimeType = screenshot.type || "image/png"

    const prompt = `
あなたは作業効率分析の専門家です。このスクリーンショットを詳細に分析して、以下の情報をJSONで返してください。

現在の予定作業: "${currentTask || "未設定"}"

画面を詳しく観察して以下を分析してください：
1. 開いているアプリケーション
2. 表示されているコンテンツの内容
3. 作業の種類
4. 予定作業との一致度

必須回答項目（JSON形式）：
{
  "activity": "画面で行われている主な活動（日本語、具体的に30文字以内）",
  "category": "productive/distracted/neutral のいずれか",
  "confidence": 0.0〜1.0の数値,
  "apps": ["使用中のアプリ名"],
  "distraction_check": {
    "is_distracted": true/false,
    "reason": "脱線している場合の理由（日本語）",
    "task_alignment": 0.0〜1.0（予定作業との一致度）
  },
  "details": "追加の詳細情報（日本語、50文字以内）"
}

判定基準：
- productive: 仕事や学習に関連した活動
- distracted: SNS、動画視聴、ゲームなど娯楽的な活動
- neutral: ブラウザのトップページなど判定が難しい状態

予定作業が設定されている場合は、task_alignmentで一致度を評価してください。`

    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: 1024,
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      console.error("Gemini API error:", errorData)

      // Check if it's a quota exceeded error (429)
      if (response.status === 429) {
        const retryAfter = errorData?.error?.details?.find(
          (d: any) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
        )?.retryDelay

        return NextResponse.json(
          {
            error: "quota_exceeded",
            message: "Gemini APIの利用制限に達しました",
            details: errorData?.error?.message || "1日あたりのリクエスト数の上限を超えています",
            retryAfter: retryAfter || "しばらく時間をおいてから再試行してください",
            userMessage: `Gemini API の無料枠の制限（1日20リクエスト）に達しました。\n\n${retryAfter ? `約${Number.parseInt(retryAfter)}秒後に再試行できます。` : "しばらく時間をおいてから再度お試しください。"}\n\nより多くのリクエストが必要な場合は、Google AI Studio で有料プランへのアップグレードをご検討ください。`,
          },
          { status: 429 },
        )
      }

      // Other API errors
      return NextResponse.json(
        {
          error: "api_error",
          message: `Gemini API error: ${response.status}`,
          details: errorData?.error?.message || "不明なエラー",
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || ""

    const jsonMatch = textContent.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error("No JSON found in response:", textContent)
      return NextResponse.json({ error: "Invalid response format from Gemini API" }, { status: 500 })
    }

    let analysis
    try {
      analysis = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error("Failed to parse JSON:", parseError)
      console.error("JSON string:", jsonMatch[0])
      return NextResponse.json({ error: "Failed to parse Gemini API response" }, { status: 500 })
    }

    return NextResponse.json({
      activity: analysis.activity || "不明な活動",
      category: analysis.category || "neutral",
      details: analysis.details || "詳細情報なし",
      confidence: analysis.confidence || 0.5,
      applications: analysis.apps || [],
      focus_score: analysis.distraction_check?.task_alignment || 0.5,
      distraction_check: analysis.distraction_check || {
        is_distracted: false,
        reason: "判定不可",
        task_alignment: 0.5,
      },
    })
  } catch (error) {
    console.error("Screenshot analysis error:", error)
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
