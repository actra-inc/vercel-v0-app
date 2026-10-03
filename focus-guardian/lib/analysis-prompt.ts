// 画面解析のプロンプト・出力スキーマ・応答の正規化（純関数）。
// 旧 /api/analyze-screenshot のサーバー側ロジックを、端末内 AI で使うために切り出したもの。
// 推論の呼び出し自体は lib/local-ai.ts、UI からの利用は components/work-log-panel.tsx。

export const DEFAULT_CATEGORY_NAMES = ["メールチェック", "娯楽", "チャット", "リサーチ", "ミーティング", "業務以外のSNS", "未分類"]

export interface AnalysisPromptOptions {
  currentTask: string
  categories: string[]
  userRules: string[]
  multiScreen: boolean
  lang: "ja" | "en"
}

// 出力の JSON Schema。Prompt API の responseConstraint に渡す
// （小型モデルは自由記述だと形式が崩れやすいため、スキーマで拘束する）
export const ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    activity: { type: "string" },
    category: { type: "string", enum: ["productive", "distracted", "neutral"] },
    work_category: { type: "string" },
    confidence: { type: "number" },
    apps: { type: "array", items: { type: "string" } },
    distraction_check: {
      type: "object",
      properties: {
        is_distracted: { type: "boolean" },
        reason: { type: "string" },
        task_alignment: { type: "number" },
      },
      required: ["is_distracted", "reason", "task_alignment"],
    },
    details: { type: "string" },
  },
  required: ["activity", "category", "work_category", "confidence", "apps", "distraction_check", "details"],
}

export function buildAnalysisPrompt(opts: AnalysisPromptOptions): string {
  const categoriesList = opts.categories.join("、")
  const multiScreenNote = opts.multiScreen
    ? `\n\n【画像について】\nこの画像は複数のディスプレイを横に並べて合成したものです。左が画面1、右が画面2です。両方の画面を見たうえで、ユーザーの主たる作業を判定してください。`
    : ""
  const userRulesNote =
    opts.userRules.length > 0
      ? `\n\n【ユーザー定義の判定ルール（最優先で尊重すること）】\n${opts.userRules.map((r) => `- ${r}`).join("\n")}`
      : ""
  const outputLang = opts.lang === "en" ? "英語" : "日本語"

  return `あなたは作業効率モニタリングシステムです。このスクリーンショットを分析し、ユーザーが何をしているかを判定してください。

現在の予定作業: "${opts.currentTask || "未設定"}"${multiScreenNote}

【脱線判定ルール】
- 以下は予定作業に関わらず必ず distracted 扱い:
  ショッピングサイト(Amazon/楽天/Yahoo!ショッピング等)、SNS(Twitter/X/Instagram/TikTok/Facebook等)、
  動画サービス(YouTube/Netflix/Hulu等)、ゲーム、まとめサイト、掲示板(5ch等)
- ニュースサイトや技術ブログは作業内容によっては neutral や productive でもよい
- 予定作業が設定されており、task_alignmentが0.35未満の場合のみ is_distracted: true にすること
- 予定作業が「未設定」の場合は判定を緩める${userRulesNote}

必須回答項目（JSON形式のみ、余計な説明不要。文章は${outputLang}で書く）：
{
  "activity": "画面で行われている主な活動（20文字以内。例：「コード編集」「資料作成」「ブラウザ閲覧」）",
  "category": "productive/distracted/neutral のいずれか",
  "work_category": "作業種類（次のいずれかから最も近いものを1つ選び、一覧の表記をそのまま書く。翻訳しない: ${categoriesList}）",
  "confidence": 0.0〜1.0の数値,
  "apps": ["画面に表示されているアプリ・サービス名（例：Chrome、VS Code、Slack、YouTube）"],
  "distraction_check": {
    "is_distracted": true/false,
    "reason": "脱線している場合の具体的な理由",
    "task_alignment": 0.0〜1.0（予定作業との一致度。ショッピング・SNS・動画は0.0〜0.2、技術調査・ドキュメント閲覧は0.6〜0.8）
  },
  "details": "画面の内容を自分の言葉で簡潔に説明（40文字以内。人名・メールアドレス・件名などの固有名詞は含めない）"
}

判定基準：productive=予定作業に関連、distracted=明らかに無関係(ショッピング/SNS/動画等)、neutral=判断が難しい活動`
}

export interface AnalysisResult {
  activity: string
  category: "productive" | "distracted" | "neutral"
  work_category: string
  details: string
  confidence: number
  applications: string[]
  focus_score: number
  distraction_check: {
    is_distracted: boolean
    reason: string
    task_alignment: number
    [key: string]: unknown
  }
}

export interface NormalizeContext {
  currentTask: string
  categories: string[]
  /** details が空だったときの既定文（i18n 済みの文字列を渡す） */
  fallbackDetails: string
  fallbackActivity: string
  /** 判定理由が返らなかったときの文言（i18n 済み）: 一致度が低くて脱線扱いにした場合 / 判定できなかった場合 */
  reasonLowAlignment: string
  reasonUnknown: string
}

/** モデルの生 JSON を、DB に保存できる形へ正規化する（旧サーバールートと同じ規則） */
export function normalizeAnalysis(analysis: any, ctx: NormalizeContext): AnalysisResult {
  const fallbackCategory = ctx.categories[ctx.categories.length - 1] || "未分類"
  const validCategory = ctx.categories.includes(analysis?.work_category) ? analysis.work_category : fallbackCategory

  // 0 は falsy のため `Number(x) || 0.5` だと task_alignment=0.0（明白な脱線）が
  // 0.5 に化ける。数値でない/欠落時のみ 0.5 にフォールバックし、0-1 にクランプする
  const rawAlignment = analysis?.distraction_check?.task_alignment
  const taskAlignment =
    typeof rawAlignment === "number" && Number.isFinite(rawAlignment) ? Math.min(1, Math.max(0, rawAlignment)) : 0.5
  const forceDistracted = !!ctx.currentTask && taskAlignment < 0.35
  const distractionCheck = analysis?.distraction_check
    ? {
        ...analysis.distraction_check,
        reason: typeof analysis.distraction_check.reason === "string" ? analysis.distraction_check.reason : "",
        task_alignment: taskAlignment,
        is_distracted: forceDistracted || !!analysis.distraction_check.is_distracted,
      }
    : {
        is_distracted: forceDistracted,
        reason: forceDistracted ? ctx.reasonLowAlignment : ctx.reasonUnknown,
        task_alignment: taskAlignment,
      }

  // category は DB 側に CHECK 制約があるため、許可3値へ正規化する
  const rawCategory = typeof analysis?.category === "string" ? analysis.category.toLowerCase().trim() : ""
  const normalizedCategory = (["productive", "distracted", "neutral"].includes(rawCategory) ? rawCategory : "neutral") as
    | "productive"
    | "distracted"
    | "neutral"

  // applications は TEXT[] 列のため、文字列のみ・上限20件に整形する
  const normalizedApps = Array.isArray(analysis?.apps)
    ? analysis.apps.filter((a: unknown): a is string => typeof a === "string" && a.length > 0).slice(0, 20)
    : []

  const confidence =
    typeof analysis?.confidence === "number" && Number.isFinite(analysis.confidence)
      ? Math.min(1, Math.max(0, analysis.confidence))
      : 0.5

  return {
    activity: typeof analysis?.activity === "string" && analysis.activity.trim() ? analysis.activity.trim() : ctx.fallbackActivity,
    category: forceDistracted ? "distracted" : normalizedCategory,
    work_category: validCategory,
    details: typeof analysis?.details === "string" && analysis.details.trim() ? analysis.details.trim() : ctx.fallbackDetails,
    confidence: Math.round(confidence * 100),
    applications: normalizedApps,
    focus_score: Math.round(taskAlignment * 100),
    distraction_check: distractionCheck,
  }
}
