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
    const extractedText = formData.get("extractedText") as string
    const apiKey = formData.get("apiKey") as string
    const currentTask = formData.get("currentTask") as string
    const categoriesJson = formData.get("categories") as string
    const categories: string[] = categoriesJson
      ? JSON.parse(categoriesJson).map((c: { name: string }) => c.name)
      : ["メールチェック", "娯楽", "チャット", "リサーチ", "ミーティング", "業務以外のSNS", "その他"]

    if (!extractedText) {
      return NextResponse.json({ error: "extractedText is required" }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    // Gemmaで抽出テキストを解析（Gemini APIを完全に排除）
    const analysisModel = "gemma-3-4b-it"
    const analysisUrl = `https://generativelanguage.googleapis.com/v1beta/models/${analysisModel}:generateContent?key=${apiKey}`

    const categoriesList = categories.join("、")
    const analysisPrompt = `あなたは厳格な作業効率モニタリングシステムです。画面情報を分析し、予定作業との一致を厳しく判定してください。

現在の予定作業: "${currentTask || "未設定"}"

画面情報:
${extractedText.slice(0, 1000)}

【厳格な脱線判定ルール】
- 予定作業が設定されている場合、画面内容が予定作業と直接関係しない場合は必ず is_distracted: true にすること
- 以下は予定作業に関わらず必ず distracted 扱い:
  ショッピングサイト(Amazon/楽天/Yahoo!ショッピング等)、SNS(Twitter/X/Instagram/TikTok/Facebook等)、
  動画サービス(YouTube/Netflix/Hulu等)、ニュースサイト閲覧、ゲーム、まとめサイト、掲示板(5ch等)
- task_alignmentが0.5未満の場合は is_distracted: true にすること
- 予定作業が「未設定」の場合のみ、判定を緩めてよい

必須回答項目（JSON形式のみ、余計な説明不要）：
{
  "activity": "画面で行われている主な活動（日本語、30文字以内）",
  "category": "productive/distracted/neutral のいずれか",
  "work_category": "作業種類（次のいずれかから最も近いものを選択: ${categoriesList}）",
  "confidence": 0.0〜1.0の数値,
  "apps": ["使用中のアプリ名"],
  "distraction_check": {
    "is_distracted": true/false,
    "reason": "脱線している場合の具体的な理由（日本語）。例: 予定作業はアプリ開発だが、Amazonで商品を閲覧している",
    "task_alignment": 0.0〜1.0（予定作業との一致度。ショッピング・SNS・動画は0.0〜0.2）
  },
  "details": "追加の詳細情報（日本語、50文字以内）"
}

判定基準：productive=予定作業に直接関係する活動、distracted=予定作業と無関係な活動(ショッピング/SNS/動画/ゲーム/ニュース等)、neutral=判定困難または予定作業未設定`

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
        work_category: categories[categories.length - 1] || "その他",
        details: extractedText.slice(0, 80),
        confidence: 0.5,
        apps: [],
        distraction_check: { is_distracted: false, reason: "", task_alignment: 0.5 },
      }
    }

    // work_categoryがカテゴリリストに含まれていなければ「その他」にフォールバック
    const validCategory = categories.includes(analysis.work_category)
      ? analysis.work_category
      : "その他"

    const taskAlignment = Number(analysis.distraction_check?.task_alignment) || 0.5
    // 予定作業が設定されており task_alignment が 0.5 未満なら強制的に脱線判定
    const forceDistracted = !!currentTask && taskAlignment < 0.5
    const distractionCheck = analysis.distraction_check
      ? {
          ...analysis.distraction_check,
          task_alignment: taskAlignment,
          is_distracted: forceDistracted || !!analysis.distraction_check.is_distracted,
        }
      : {
          is_distracted: forceDistracted,
          reason: forceDistracted ? "予定作業との一致度が低い" : "判定不可",
          task_alignment: taskAlignment,
        }

    return NextResponse.json({
      activity: analysis.activity || "不明な活動",
      category: forceDistracted ? "distracted" : (analysis.category || "neutral"),
      work_category: validCategory,
      details: analysis.details || extractedText.slice(0, 80) || "詳細情報なし",
      confidence: Math.round((Number(analysis.confidence) || 0.5) * 100),
      applications: analysis.apps || [],
      focus_score: Math.round(taskAlignment * 100),
      distraction_check: distractionCheck,
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
