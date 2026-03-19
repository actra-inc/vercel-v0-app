import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies()

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
    const extractedText = formData.get("extractedText") as string
    const apiKey = formData.get("apiKey") as string
    const currentTask = formData.get("currentTask") as string

    if (!extractedText) {
      return NextResponse.json({ error: "extractedText is required" }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    // Gemmaで抽出テキストを解析（Gemini APIを完全に排除）
    const analysisModel = "gemma-3-4b-it"
    const analysisUrl = `https://generativelanguage.googleapis.com/v1beta/models/${analysisModel}:generateContent?key=${apiKey}`

    const analysisPrompt = `あなたは作業効率分析の専門家です。以下の画面情報を分析してJSONで返してください。

現在の予定作業: "${currentTask || "未設定"}"

画面情報:
${extractedText.slice(0, 1000)}

必須回答項目（JSON形式のみ、余計な説明不要）：
{
  "activity": "画面で行われている主な活動（日本語、30文字以内）",
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

判定基準：productive=仕事/学習、distracted=SNS/動画/ゲーム、neutral=判定困難`

    const response = await fetch(analysisUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: analysisPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      console.error("Gemma API error:", errorData)
      if (response.status === 429) {
        const retryAfter = errorData?.error?.details?.find(
          (d: any) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
        )?.retryDelay
        return NextResponse.json(
          {
            error: "quota_exceeded",
            message: "Gemma APIの利用制限に達しました",
            details: errorData?.error?.message || "利用制限を超えています",
            retryAfter: retryAfter || "しばらく時間をおいてから再試行してください",
            userMessage: `Gemma API の制限に達しました。\n\n${retryAfter ? `約${Number.parseInt(retryAfter)}秒後に再試行できます。` : "しばらく時間をおいてから再度お試しください。"}`,
          },
          { status: 429 },
        )
      }
      return NextResponse.json(
        { error: "api_error", message: `Gemma API error: ${response.status}`, details: errorData?.error?.message || "不明なエラー" },
        { status: response.status },
      )
    }

    const data = await response.json()
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || ""

    // GemmaのレスポンスからJSONを抽出
    let analysis: any = null
    const jsonMatch = textContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        analysis = JSON.parse(jsonMatch[0])
      } catch (parseError) {
        console.error("Failed to parse Gemma JSON:", parseError)
      }
    }

    // パース失敗時でも必ずログが保存されるようフォールバック
    if (!analysis) {
      console.warn("Gemma JSON parse failed, using extracted text as fallback")
      analysis = {
        activity: "画面解析",
        category: "neutral",
        details: extractedText.slice(0, 80),
        confidence: 0.5,
        apps: [],
        distraction_check: { is_distracted: false, reason: "", task_alignment: 0.5 },
      }
    }

    return NextResponse.json({
      activity: analysis.activity || "不明な活動",
      category: analysis.category || "neutral",
      details: analysis.details || extractedText.slice(0, 80) || "詳細情報なし",
      confidence: Math.round((Number(analysis.confidence) || 0.5) * 100),
      applications: analysis.apps || [],
      focus_score: Math.round((Number(analysis.distraction_check?.task_alignment) || 0.5) * 100),
      distraction_check: analysis.distraction_check
        ? {
            ...analysis.distraction_check,
            task_alignment: Number(analysis.distraction_check.task_alignment) || 0.5,
          }
        : {
            is_distracted: false,
            reason: "判定不可",
            task_alignment: 0.5,
          },
      extracted_text: extractedText,
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
