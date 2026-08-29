import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

// クライアントが model を指定しなかった場合のフォールバック既定モデル
const DEFAULT_ANALYSIS_MODEL = "gemini-3.5-flash-lite"

// URLのパス断片に埋め込むため、モデルIDとして妥当な文字列だけを通す
const isValidModelId = (m: unknown): m is string =>
  typeof m === "string" && /^[a-zA-Z0-9._-]+$/.test(m)
// 合計試行回数（初回 + リトライ1回）。旧名 MAX_RETRIES は「リトライ回数」と紛らわしかった
const MAX_ATTEMPTS = 2
// 429リトライで待つ最大秒数。これを超える待ちはサーバー側で抱え込まず即座に返す
// （クライアントは次回キャプチャで自動再試行するため、長い待ちに意味がない。
//   vercel.json の maxDuration=30s の範囲にも収める。確信が持てないため10秒を採用）
const MAX_429_WAIT_SECONDS = 10

// Gemini の 429 レスポンスから RetryInfo.retryDelay（例: "27s"）の秒数を取り出す。
// clone() で読むため、呼び出し側は返された Response の本文をそのまま消費できる
async function extractRetryDelaySeconds(response: Response): Promise<number | null> {
  try {
    const data = await response.clone().json()
    const retryDelay = data?.error?.details?.find(
      (d: any) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
    )?.retryDelay
    if (typeof retryDelay !== "string") return null
    const seconds = Number.parseFloat(retryDelay)
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
  } catch {
    return null
  }
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  let lastResponse: Response | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, options)
    lastResponse = response

    // 500/503: サーバー一時エラー → 指数バックオフで再試行
    if (response.status === 500 || response.status === 503) {
      if (attempt < MAX_ATTEMPTS) {
        const delay = 1000 * Math.pow(2, attempt - 1)
        console.warn(`[Gemini] ${response.status} on attempt ${attempt}, retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }
      return response
    }

    // 429: レート制限 → サーバーが示す retryDelay が短いときだけ1回待って再試行。
    // retryDelay 不明・長すぎる場合はリトライせず即返す（quota_exceeded として整形される）
    if (response.status === 429) {
      const delaySeconds = attempt < MAX_ATTEMPTS ? await extractRetryDelaySeconds(response) : null
      if (delaySeconds === null || delaySeconds > MAX_429_WAIT_SECONDS) {
        return response
      }
      console.warn(`[Gemini] 429 on attempt ${attempt}, honoring retryDelay=${delaySeconds}s before retrying...`)
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000))
      continue
    }

    return response
  }
  return lastResponse!
}

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
    const imageData = formData.get("imageData") as string
    const mimeType = (formData.get("mimeType") as string) || "image/jpeg"
    const apiKey = formData.get("apiKey") as string
    const currentTask = formData.get("currentTask") as string
    const categoriesJson = formData.get("categories") as string
    // 複数ディスプレイの横並び合成画像かどうか（クライアントが合成時のみ "1" を送る）
    const isMultiScreen = formData.get("multiScreen") === "1"
    // 設定画面で選んだ解析モデル（未指定・不正値は既定にフォールバック）
    const modelParam = formData.get("model")
    const analysisModel = isValidModelId(modelParam) ? modelParam : DEFAULT_ANALYSIS_MODEL
    const DEFAULT_CATEGORY_NAMES = ["メールチェック", "娯楽", "チャット", "リサーチ", "ミーティング", "業務以外のSNS", "未分類"]
    let categories: string[] = DEFAULT_CATEGORY_NAMES
    if (categoriesJson) {
      try {
        const parsed = JSON.parse(categoriesJson)
        if (Array.isArray(parsed)) {
          const names = parsed
            .map((c: { name?: string }) => c?.name)
            .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
          if (names.length > 0) categories = names
        }
      } catch {
        // 不正なJSONはデフォルトカテゴリで続行
      }
    }
    // AIがカテゴリ一覧にない値を返した場合のフォールバック（一覧の末尾＝未分類）
    const fallbackCategory = categories[categories.length - 1] || "未分類"

    if (!imageData) {
      return NextResponse.json({ error: "imageData is required" }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    // APIキーはURLクエリ(?key=)ではなくヘッダーで送る（ログ・プロキシへの漏えい面を減らす）
    const analysisUrl = `https://generativelanguage.googleapis.com/v1beta/models/${analysisModel}:generateContent`

    const categoriesList = categories.join("、")
    // 複数ディスプレイ合成時のみ追加する説明（1画面時は空文字＝プロンプト不変）
    const multiScreenNote = isMultiScreen
      ? `\n\n【画像について】\nこの画像は複数のディスプレイを横に並べて合成したものです。左が画面1、右が画面2です。両方の画面を見たうえで、ユーザーの主たる作業を判定してください。`
      : ""
    const analysisPrompt = `あなたは作業効率モニタリングシステムです。このスクリーンショットを分析し、ユーザーが何をしているかを判定してください。

現在の予定作業: "${currentTask || "未設定"}"${multiScreenNote}

【脱線判定ルール】
- 以下は予定作業に関わらず必ず distracted 扱い:
  ショッピングサイト(Amazon/楽天/Yahoo!ショッピング等)、SNS(Twitter/X/Instagram/TikTok/Facebook等)、
  動画サービス(YouTube/Netflix/Hulu等)、ゲーム、まとめサイト、掲示板(5ch等)
- ニュースサイトや技術ブログは作業内容によっては neutral や productive でもよい
- 予定作業が設定されており、task_alignmentが0.35未満の場合のみ is_distracted: true にすること
- 予定作業が「未設定」の場合は判定を緩める

必須回答項目（JSON形式のみ、余計な説明不要）：
{
  "activity": "画面で行われている主な活動（日本語、20文字以内。例：「コード編集」「資料作成」「ブラウザ閲覧」）",
  "category": "productive/distracted/neutral のいずれか",
  "work_category": "作業種類（次のいずれかから最も近いものを選択: ${categoriesList}）",
  "confidence": 0.0〜1.0の数値,
  "apps": ["画面に表示されているアプリ・サービス名（例：Chrome、VS Code、Slack、YouTube）"],
  "distraction_check": {
    "is_distracted": true/false,
    "reason": "脱線している場合の具体的な理由（日本語）",
    "task_alignment": 0.0〜1.0（予定作業との一致度。ショッピング・SNS・動画は0.0〜0.2、技術調査・ドキュメント閲覧は0.6〜0.8）
  },
  "details": "画面の内容を自分の言葉で簡潔に説明（日本語、40文字以内）"
}

判定基準：productive=予定作業に関連、distracted=明らかに無関係(ショッピング/SNS/動画等)、neutral=判断が難しい活動`

    const response = await fetchWithRetry(analysisUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: imageData,
              },
            },
            { text: analysisPrompt },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      console.error("Gemini API error:", errorData)
      if (response.status === 429) {
        const retryAfter = errorData?.error?.details?.find(
          (d: any) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
        )?.retryDelay
        return NextResponse.json(
          {
            error: "quota_exceeded",
            message: "Gemini APIの利用制限に達しました",
            details: errorData?.error?.message || "利用制限を超えています",
            retryAfter: retryAfter || "しばらく時間をおいてから再試行してください",
            userMessage: `Gemini API の制限に達しました。\n\n${retryAfter ? `約${Number.parseInt(retryAfter)}秒後に再試行できます。` : "しばらく時間をおいてから再度お試しください。"}`,
          },
          { status: 429 },
        )
      }
      return NextResponse.json(
        { error: "api_error", message: `Gemini API error: ${response.status}`, details: errorData?.error?.message || "不明なエラー" },
        { status: response.status },
      )
    }

    const data = await response.json()
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || ""

    let analysis: any = null
    const jsonMatch = textContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        analysis = JSON.parse(jsonMatch[0])
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON:", parseError)
      }
    }

    if (!analysis) {
      console.warn("Gemini JSON parse failed, using fallback")
      analysis = {
        activity: "画面解析",
        category: "neutral",
        work_category: fallbackCategory,
        details: currentTask ? `「${currentTask}」の作業中` : "作業内容を解析しました",
        confidence: 0.5,
        apps: [],
        distraction_check: { is_distracted: false, reason: "", task_alignment: 0.5 },
      }
    }

    const validCategory = categories.includes(analysis.work_category)
      ? analysis.work_category
      : fallbackCategory

    // 0 は falsy のため `Number(x) || 0.5` だと task_alignment=0.0（明白な脱線）が
    // 0.5 に化けて強制脱線判定が効かず、focus_score も 50 に上振れしていた。
    // 数値でない/欠落時のみ 0.5 にフォールバックし、0-1 にクランプする
    const rawAlignment = analysis.distraction_check?.task_alignment
    const taskAlignment =
      typeof rawAlignment === "number" && Number.isFinite(rawAlignment)
        ? Math.min(1, Math.max(0, rawAlignment))
        : 0.5
    const forceDistracted = !!currentTask && taskAlignment < 0.35
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

    // category はDB側に CHECK (IN ('productive','distracted','neutral')) があるため、
    // モデルが大文字や日本語ラベルを返すと insert が23514で失敗し、その解析回の
    // 記録が丸ごと失われる。許可3値へ正規化する
    const rawCategory = typeof analysis.category === "string" ? analysis.category.toLowerCase().trim() : ""
    const normalizedCategory = ["productive", "distracted", "neutral"].includes(rawCategory)
      ? rawCategory
      : "neutral"

    // applications は TEXT[] 列のため、文字列以外の要素が混ざると配列リテラル
    // エラーで insert が失敗する。文字列のみ・上限20件に整形する
    const normalizedApps = Array.isArray(analysis.apps)
      ? analysis.apps.filter((a: unknown): a is string => typeof a === "string" && a.length > 0).slice(0, 20)
      : []

    return NextResponse.json({
      activity: analysis.activity || "不明な活動",
      category: forceDistracted ? "distracted" : normalizedCategory,
      work_category: validCategory,
      details: analysis.details || (currentTask ? `「${currentTask}」の作業中` : "作業内容を解析しました"),
      confidence: Math.round(
        (typeof analysis.confidence === "number" && Number.isFinite(analysis.confidence)
          ? Math.min(1, Math.max(0, analysis.confidence))
          : 0.5) * 100,
      ),
      applications: normalizedApps,
      focus_score: Math.round(taskAlignment * 100),
      distraction_check: distractionCheck,
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
