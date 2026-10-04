// 画面解析のプロンプト・出力スキーマ・応答の正規化（純関数）。
// 旧 /api/analyze-screenshot のサーバー側ロジックを、端末内 AI で使うために切り出したもの。
// 推論の呼び出し自体は lib/local-ai.ts、UI からの利用は components/work-log-panel.tsx。

export const DEFAULT_CATEGORY_NAMES = ["メールチェック", "娯楽", "チャット", "リサーチ", "ミーティング", "業務以外のSNS", "未分類"]

// work_category が一覧に無いときのフォールバック先として扱う表記（大小・前後空白を無視して突き合わせる）
const UNCATEGORIZED_ALIASES = ["未分類", "その他", "other", "uncategorized"]
const UNCATEGORIZED_FALLBACK = "未分類"

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
    opts.userRules.length > 0 ? `\n${opts.userRules.map((r) => `- ${r}`).join("\n")}` : ""
  const outputLang = opts.lang === "en" ? "英語" : "日本語"

  return `あなたは作業効率モニタリングシステムです。このスクリーンショットを分析し、ユーザーが何をしているかを判定してください。

現在の予定作業: "${opts.currentTask || "未設定"}"${multiScreenNote}

【脱線判定の優先順位】（数字が小さいほど優先。上位の条件に当てはまればそこで判定を確定し、下位は見ない）
1. ユーザー定義の判定ルールが示されていれば、それを最優先で適用する。${userRulesNote}
2. 1に当てはまらない場合、以下は予定作業に関わらず distracted 扱いとする:
   ショッピングサイト(Amazon/楽天/Yahoo!ショッピング等)、SNS(Twitter/X/Instagram/TikTok/Facebook等)、
   動画サービス(YouTube/Netflix/Hulu等)、ゲーム、まとめサイト、掲示板(5ch等)
3. 1にも2にも当てはまらない場合は、予定作業とどれくらい関係があるかで判断する。
   ニュースサイトや技術ブログは内容次第で neutral や productive にもなり得る。
   予定作業が「未設定」のときは予定作業との比較はせず、2のような明らかな娯楽系のみ distracted とし、
   それ以外で判断がつかない場合は neutral とする。

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
    "task_alignment": 0.0〜1.0の数値（予定作業とどれくらい関係があるかを表す）
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
  /**
   * 有効なユーザー定義ルールが1件以上あるかどうか（省略可。既存呼び出し元との互換のため）。
   * 省略時は「ルール無し」と同じ扱いになるが、下の isDistracted 判定で説明する通り、
   * それでも「モデルが明示した is_distracted」は尊重される（安全側＝誤検知を増やさない方向）。
   */
  hasUserRules?: boolean
}

function normalizeForCompare(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function resolveFallbackWorkCategory(categories: string[]): string {
  const found = categories.find((c) => UNCATEGORIZED_ALIASES.includes(normalizeForCompare(c)))
  return found ?? UNCATEGORIZED_FALLBACK
}

/** work_category をカテゴリ一覧に正規化する（完全一致が無ければ trim・大小無視で突き合わせ、一覧の表記で返す） */
function resolveWorkCategory(raw: unknown, categories: string[]): string {
  const target = normalizeForCompare(raw)
  if (target) {
    const match = categories.find((c) => normalizeForCompare(c) === target)
    if (match) return match
  }
  return resolveFallbackWorkCategory(categories)
}

/**
 * task_alignment / confidence 用の共通正規化ヘルパー。
 * - 数値以外（"0.1" のような数字文字列、"80%" のようなパーセント表記）も Number() 相当で解釈する。
 * - 1 より大きい値のときだけ 0〜100 スケールとみなして 100 で割る（1 はそのまま 1.0 として扱う）。
 * - 0 は falsy だが有効な値なので、`value || default` ではなく解釈失敗時だけ default を使う。
 * - 最後に 0〜1 にクランプする。
 */
function toRatio(raw: unknown, fallback: number): number {
  let n: number
  if (typeof raw === "number") {
    n = raw
  } else if (typeof raw === "string") {
    n = Number(raw.trim().replace(/%\s*$/, ""))
  } else {
    return fallback
  }
  if (!Number.isFinite(n)) return fallback
  const ratio = n > 1 ? n / 100 : n
  return Math.min(1, Math.max(0, ratio))
}

/** モデルの生 JSON を、DB に保存できる形へ正規化する（旧サーバールートと同じ規則） */
export function normalizeAnalysis(analysis: any, ctx: NormalizeContext): AnalysisResult {
  const validCategory = resolveWorkCategory(analysis?.work_category, ctx.categories)

  const taskAlignment = toRatio(analysis?.distraction_check?.task_alignment, 0.5)
  const confidence = toRatio(analysis?.confidence, 0.5)

  // 脱線判定の優先順位（リーダー確定仕様）: 1) ユーザー定義ルール 2) 「必ず distracted」サイト一覧
  // 3) task_alignment 0.35 の閾値。1・2 はプロンプト側の指示としてモデルに渡しており、結果は
  // モデル自身が返す is_distracted に反映される設計にした（H-6）。そのためコード側は
  // 「モデルが真偽値で明示したかどうか」だけを見ればよい。
  const modelIsDistracted = analysis?.distraction_check?.is_distracted
  const modelSaidBoolean = typeof modelIsDistracted === "boolean"
  let isDistracted: boolean
  if (ctx.hasUserRules && modelSaidBoolean) {
    // 1. ユーザールールがある場合は、モデルの判断をそのまま採用し閾値で上書きしない
    isDistracted = modelIsDistracted
  } else if (modelSaidBoolean) {
    // 2. ユーザールールが無い（または未指定の）場合でも、モデルが真偽値で明示していればそれを尊重する。
    //    hasUserRules を省略したときも同じ扱いになるのは意図的: 「ルール登録が無い=閾値で機械的に
    //    上書きしてよい」わけではなく、単にモデルが素直に判断できただけのことも多いため、
    //    誤って distracted にしない方向（安全側）に倒した。
    isDistracted = modelIsDistracted
  } else {
    // 3. モデルが is_distracted を真偽値で返さなかった（欠落・型違い）ときだけ、
    //    予定作業があり task_alignment が 0.35 未満なら distracted とみなす補完を行う。
    isDistracted = !!ctx.currentTask && taskAlignment < 0.35
  }

  const rawReason =
    typeof analysis?.distraction_check?.reason === "string" ? analysis.distraction_check.reason.trim() : ""
  // reason が空文字のまま下流に出ないよう、既定文へフォールバックする（distraction_check オブジェクトが
  // 返ってきた場合も含む。以前は analysis.distraction_check が存在するときだけこのフォールバックが
  // 効かず、強制 distracted でも reason が空文字のままになり得た）
  const reason = rawReason || (isDistracted ? ctx.reasonLowAlignment : ctx.reasonUnknown)

  const hasDistractionCheckObject =
    analysis?.distraction_check && typeof analysis.distraction_check === "object" && !Array.isArray(analysis.distraction_check)
  const distractionCheck = {
    ...(hasDistractionCheckObject ? analysis.distraction_check : {}),
    is_distracted: isDistracted,
    reason,
    task_alignment: taskAlignment,
  }

  // category は DB 側に CHECK 制約があるため、許可3値へ正規化する
  const rawCategory = typeof analysis?.category === "string" ? analysis.category.toLowerCase().trim() : ""
  const normalizedCategory = (["productive", "distracted", "neutral"].includes(rawCategory) ? rawCategory : "neutral") as
    | "productive"
    | "distracted"
    | "neutral"
  // is_distracted と category が食い違わないよう、distracted と判定したら category も distracted にする
  const category = isDistracted ? "distracted" : normalizedCategory

  // applications は TEXT[] 列のため、文字列のみ・上限20件に整形する
  const normalizedApps = Array.isArray(analysis?.apps)
    ? analysis.apps.filter((a: unknown): a is string => typeof a === "string" && a.length > 0).slice(0, 20)
    : []

  return {
    activity: typeof analysis?.activity === "string" && analysis.activity.trim() ? analysis.activity.trim() : ctx.fallbackActivity,
    category,
    work_category: validCategory,
    details: typeof analysis?.details === "string" && analysis.details.trim() ? analysis.details.trim() : ctx.fallbackDetails,
    confidence: Math.round(confidence * 100),
    applications: normalizedApps,
    focus_score: Math.round(taskAlignment * 100),
    distraction_check: distractionCheck,
  }
}
