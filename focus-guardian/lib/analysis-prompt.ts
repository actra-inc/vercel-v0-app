// 画面解析のプロンプト・出力スキーマ・応答の正規化（純関数）。
// 旧 /api/analyze-screenshot のサーバー側ロジックを、端末内 AI で使うために切り出したもの。
// 推論の呼び出し自体は lib/local-ai.ts、UI からの利用は components/work-log-panel.tsx。

export const DEFAULT_CATEGORY_NAMES = ["メールチェック", "娯楽", "チャット", "リサーチ", "ミーティング", "業務以外のSNS", "未分類"]

// 脱線を表す既定の作業種類。判定が「脱線ではない」の回にこれが付くのは矛盾なので「未分類」に戻す
// （英語で答えさせると、コード編集に「業務以外のSNS」を付ける回があった。2026-10-06 実モデル確認）
const DISTRACTION_CATEGORY_NAMES = ["娯楽", "業務以外のSNS"]

// work_category が一覧に無いときのフォールバック先として扱う表記（大小・前後空白を無視して突き合わせる）
const UNCATEGORIZED_ALIASES = ["未分類", "その他", "other", "uncategorized"]
const UNCATEGORIZED_FALLBACK = "未分類"

// apps の上限（プロンプトの「最大5件」と揃える）と、details の既定の最大文字数
const MAX_APPS = 5
const DEFAULT_DETAILS_MAX = 40

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
  // 指示文が日本語のため、途中の「英語で書く」だけでは Nano が日本語で答えた（2026-10-06 実モデル確認）。
  // 英語のときは末尾に英語で念押しする。work_category は一覧の表記のまま（翻訳しない）
  const englishNote =
    opts.lang === "en"
      ? `\n\nIMPORTANT: Write "activity", "details" and "reason" in English, not Japanese. Keep "work_category" exactly as written in the list.`
      : ""

  // 冒頭でシステム自身を名乗らせない（「作業効率モニタリングシステム」と名乗ると、FlowNudge 自身の画面を
  // モデルがその名で言い換え、2 段目で予定作業「flownudge」と結び付かなくなった。2026-10-05 実画面テスト）
  return `あなたはユーザーのスクリーンショットから作業内容を判定するアシスタントです。このスクリーンショットを分析し、ユーザーが何をしているかを判定してください。

現在の予定作業: "${opts.currentTask || "未設定"}"${multiScreenNote}

【脱線判定の優先順位】（数字が小さいほど優先。上位の条件に当てはまればそこで判定を確定し、下位は見ない）
1. ユーザー定義の判定ルールが示されていれば、それを最優先で適用する。${userRulesNote}
2. 1に当てはまらない場合、以下は予定作業に関わらず distracted 扱いとする:
   ショッピングサイト(Amazon/楽天/Yahoo!ショッピング等)、SNS(Twitter/X/Instagram/TikTok/Facebook等)、
   動画サービス(YouTube/Netflix/Hulu等)、ゲーム、まとめサイト、掲示板(5ch等)
   ただし、予定作業そのものがその種類の活動（例：予定作業が「買い物」で画面がショッピングサイト）なら2は適用せず、4で判定する。
3. 画面に FlowNudge（この集中支援アプリ。作業ログ・画面解析の状況・レポート・設定画面など）が表示されているときは、
   activity と details に「${opts.lang === "en" ? "FlowNudge screen" : "FlowNudge の画面"}」と書き、それ自体は脱線扱いにしない（is_distracted: false）。
4. 1〜3のいずれにも当てはまらない場合は、画面の作業が予定作業そのもの（または予定作業に直接必要な作業）かを確かめる。
   仕事であっても、予定作業とは明らかに別の業務・別のテーマなら is_distracted は true、task_alignment は 0.3 以下にする。
   （例：予定作業が「経理の請求書処理」で、画面がプログラミングなら、別の業務なので is_distracted: true）
   ニュースサイトや技術ブログは内容次第で neutral や productive にもなり得る。
   予定作業が「未設定」のときは予定作業との比較はせず、2のような明らかな娯楽系のみ distracted とし、
   それ以外で判断がつかない場合は neutral とする。

回答は次の形の JSON を1つだけ返す（余計な説明は不要。文章は${outputLang}で書く）。null の所に、画像を見て判断した値を入れる。下の「各項目の書き方」の説明文は書き写さない。
{"activity": null, "category": null, "work_category": null, "confidence": null, "apps": [], "distraction_check": {"is_distracted": null, "reason": null, "task_alignment": null}, "details": null}

各項目の書き方：
- activity: 画面で行われている主な活動を20文字以内で（例：コード編集、資料作成、ブラウザ閲覧、SNS閲覧）
- category: productive、distracted、neutral のどれか1語
- work_category: 次の一覧から最も近いものを1つ選び、一覧の表記をそのまま書く。翻訳しない: ${categoriesList}
- confidence: 0.0〜1.0の数値
- apps: 画面に実際に表示されていて名前が読み取れるアプリ・サービス名のみ（最大5件。見えないものを推測で書かない）
- distraction_check.is_distracted: true か false
- distraction_check.reason: 判定の理由を30文字以内で
- distraction_check.task_alignment: 予定作業とどれくらい関係があるかを表す0.0〜1.0の数値
- details: 画面の内容を自分の言葉で簡潔に説明（40文字以内。人名・メールアドレス・件名などの固有名詞は含めない）

判定基準：productive=予定作業に関連、distracted=明らかに無関係(ショッピング/SNS/動画等)、neutral=判断が難しい活動${englishNote}`
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
  /** 動画・SNS・買い物などのサイトをコード側で脱線と確定したときの理由（省略時は reasonLowAlignment） */
  reasonLeisureSite?: string
  /** details の最大文字数（省略時 40）。英語 UI では長めにしてよい */
  detailsMaxLength?: number
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

// 予定作業に関わらず脱線とみなすサイト（プロンプトの優先順位 2 と同じ範囲）。
// モデルが挙げたアプリ名・活動名だけを見る（要約文は「YouTube の解説を参考に実装」のように
// 仕事中にも名前が出やすいので見ない）。誤検知を避けるため、業務でも使う名前は除外条件を付ける
// [表示名, 種類, 該当パターン, 除外パターン（当てはまれば業務利用とみなす）]
type LeisureKind = "video" | "sns" | "shopping" | "forum"
const LEISURE_SITE_PATTERNS: Array<[string, LeisureKind, RegExp, RegExp?]> = [
  ["YouTube", "video", /youtube/i, /studio|\bapi\b|data\s*api/i],
  ["Netflix", "video", /netflix/i],
  ["Hulu", "video", /hulu/i],
  ["Prime Video", "video", /prime\s*video|プライム\s*ビデオ/i],
  ["ABEMA", "video", /abema/i],
  ["TikTok", "sns", /tiktok/i],
  ["Instagram", "sns", /instagram|インスタグラム/i],
  ["Facebook", "sns", /facebook|フェイスブック/i],
  // apps に「X」だけ、activity が「Xのタイムライン閲覧」のように出る（2026-10-22 実モデル確認）。Xcode・XD などは除く
  ["X (Twitter)", "sns", /twitter|ツイッター|(?<![\w.-])x\.com\b|^\s*x(?![a-z0-9])/i],
  ["ニコニコ", "video", /niconico|ニコニコ/i],
  ["Twitch", "video", /twitch/i],
  ["5ch", "forum", /(?<![\w.])5ch\b|５ちゃんねる|2ちゃんねる|2ch\.net/i],
  ["まとめサイト", "forum", /まとめサイト/],
  ["Amazon", "shopping", /amazon|アマゾン/i, /\baws\b|web\s*services|seller\s*central|セラーセントラル|amazon\s*business|amazon\s*ビジネス|請求書|invoice|\bapi\b/i],
  ["楽天", "shopping", /楽天|rakuten/i, /銀行|証券|カード|bank|rms|api/i],
  ["Yahoo!ショッピング", "shopping", /yahoo!?\s*ショッピング|ヤフーショッピング|yahoo\s*shopping/i],
  ["メルカリ", "shopping", /メルカリ|mercari/i],
  ["ZOZOTOWN", "shopping", /zozotown/i],
]

// activity にサイト名が出ても、閲覧・視聴・買い物を表す語と一緒のときだけ判定に使う
// （「YouTube Data API の実装」「Amazon の請求書ダウンロード」のような業務の文脈を脱線にしないため）
const LEISURE_ACTIVITY_VERB = /視聴|閲覧|見て|検索|購入|買い物|ショッピング|商品|動画|タイムライン|投稿|watch|brows|view|shop|scroll|feed/i

// 予定作業そのものがその種類の活動を指すときは、サイトを見ていても脱線と確定しない
// （2026-10-06 実画面テスト：予定作業「go back home, shopping」で Amazon を 7 回とも脱線と判定し警告音が鳴った）
const TASK_KIND_PATTERNS: Record<LeisureKind, RegExp> = {
  shopping: /買い物|買物|ショッピング|購入|通販|shopping|\bshop\b|\bbuy|purchase/i,
  video: /動画|映像|映画|視聴|video|movie/i,
  sns: /\bsns\b|ソーシャル|social|投稿|広報|ツイート|tweet/i,
  forum: /掲示板|まとめ|forum/i,
}

function taskCoversLeisure(currentTask: string, name: string, kind: LeisureKind): boolean {
  const task = currentTask.trim()
  if (!task) return false
  if (TASK_KIND_PATTERNS[kind].test(task)) return true
  const site = LEISURE_SITE_PATTERNS.find(([n]) => n === name)
  return !!site && site[2].test(task)
}

/**
 * モデルの出力（apps と activity）に、予定作業に関わらず脱線のサイトが含まれていれば、その名前を返す。
 * ただし予定作業がそのサイト名や同じ種類の活動（買い物・動画・SNS 等）を指すときは返さない。
 * 判定は要素ごと（除外パターンも要素ごと。「AWS Console」と「Amazon.co.jp」が並ぶ画面で買い物を見逃さない）。
 * FlowNudge 自身の画面（過去の作業ログに「YouTube 視聴」等が並ぶ）では判定しない
 */
export function detectLeisureSite(analysis: any, currentTask = ""): string | null {
  const site = findLeisureSite(analysis)
  return site && !taskCoversLeisure(currentTask, site.name, site.kind) ? site.name : null
}

/** 予定作業が、画面に出ている娯楽系サイトそのもの・同じ種類の活動を指しているか（例：予定「買い物」で Amazon） */
export function isPlannedLeisure(analysis: any, currentTask: string): boolean {
  const site = findLeisureSite(analysis)
  return !!site && taskCoversLeisure(currentTask, site.name, site.kind)
}

function findLeisureSite(analysis: any): { name: string; kind: LeisureKind } | null {
  const apps: string[] = Array.isArray(analysis?.apps) ? analysis.apps.filter((a: unknown): a is string => typeof a === "string") : []
  const activity = typeof analysis?.activity === "string" ? analysis.activity : ""
  if ([...apps, activity].some((t) => /flownudge/i.test(t))) return null
  const candidates = [...apps]
  if (LEISURE_ACTIVITY_VERB.test(activity)) candidates.push(activity)
  for (const text of candidates) {
    for (const [name, kind, re, exclude] of LEISURE_SITE_PATTERNS) {
      if (re.test(text) && !exclude?.test(text)) return { name, kind }
    }
  }
  return null
}

// モデルが画面を判定せず、プロンプトの説明文や雛形をそのまま返したときに出る語
// （2026-10-22 実画面：activity が「画面で行われている主な活動（20文字以内。例：…）」の記録が 25 件中 23 件。
//   脱線かどうかが読めず「集中度 50・脱線なし」で保存され、X なども素通りになった）
const TEMPLATE_ECHO_MARKERS = /文字以内|例：|のどれか|のいずれか|0\.0〜1\.0|true か false|true\/false|書き写さない|一覧から|各項目の書き方/

/**
 * 判定として使えない応答か（雛形の書き写し・脱線かどうかが真偽値で無い・活動名が無い）。
 * 使えない応答を正規化すると既定値（集中度 50・脱線なし）の偽の記録になるため、呼び出し側でやり直す
 */
export function isUnusableAnalysis(analysis: any): boolean {
  if (!analysis || typeof analysis !== "object") return true
  const dc = analysis.distraction_check
  const isD = dc?.is_distracted
  const boolish = typeof isD === "boolean" || (typeof isD === "string" && /^(true|false)$/i.test(isD.trim()))
  if (!boolish) return true
  if (typeof analysis.activity !== "string" || !analysis.activity.trim()) return true
  const texts = [analysis.activity, analysis.details, dc?.reason, ...(Array.isArray(analysis.apps) ? analysis.apps : [])]
  return texts.some((v) => typeof v === "string" && TEMPLATE_ECHO_MARKERS.test(v))
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
  // "true" / "false" の文字列で返す回もあるので真偽値として読む
  const rawIsDistracted = analysis?.distraction_check?.is_distracted
  const modelIsDistracted =
    typeof rawIsDistracted === "string" && /^(true|false)$/i.test(rawIsDistracted.trim())
      ? rawIsDistracted.trim().toLowerCase() === "true"
      : rawIsDistracted
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

  // 優先順位 2（予定作業に関わらず脱線のサイト）は、モデルの判断に任せず、モデルが挙げた
  // アプリ名・活動名からコード側でも確定させる。2026-10-06 の実モデル確認で、Amazon の画面を
  // 「予定作業に関連」と誤答した例があったため。ユーザー定義ルールがあるときはルールを優先して適用しない
  // （「YouTube の講義動画は仕事」等のルールを潰さないため）
  const leisureSite = ctx.hasUserRules ? null : detectLeisureSite(analysis, ctx.currentTask)
  if (leisureSite) isDistracted = true
  // 逆に、予定作業そのものが買い物・動画などで画面がそのサイトなら、モデルが脱線と答えても脱線にしない
  // （プロンプトの但し書きだけでは Nano が守らず、予定「go back home, shopping」で楽天を脱線と答えた。2026-10-06）
  const plannedLeisure = !ctx.hasUserRules && isPlannedLeisure(analysis, ctx.currentTask)
  if (plannedLeisure) isDistracted = false

  const rawReason =
    typeof analysis?.distraction_check?.reason === "string" ? analysis.distraction_check.reason.trim() : ""
  // reason が空文字のまま下流に出ないよう、既定文へフォールバックする（distraction_check オブジェクトが
  // 返ってきた場合も含む。以前は analysis.distraction_check が存在するときだけこのフォールバックが
  // 効かず、強制 distracted でも reason が空文字のままになり得た）
  // ただし、モデルが「脱線ではない」と真偽値で明示して理由を書かなかっただけなら空のままにする
  // （判定できているのに「判定できませんでした」と表示されて紛らわしかった）
  // モデルが脱線と答えていない回（モデルの理由は「関連」等で矛盾する）と、理由が空の回はサイト用の理由にする
  const reason = plannedLeisure && modelIsDistracted === true
    ? "" // モデルの理由（「買い物サイトのため脱線」等）は結論と矛盾するので残さない
    : leisureSite && (modelIsDistracted !== true || !rawReason)
    ? ctx.reasonLeisureSite ?? ctx.reasonLowAlignment
    : rawReason || (isDistracted ? ctx.reasonLowAlignment : modelSaidBoolean ? "" : ctx.reasonUnknown)

  const hasDistractionCheckObject =
    analysis?.distraction_check && typeof analysis.distraction_check === "object" && !Array.isArray(analysis.distraction_check)
  // サイトで脱線を確定した回は、集中度（task_alignment×100）も低く揃える
  const finalAlignment = leisureSite
    ? Math.min(taskAlignment, 0.2)
    : plannedLeisure
      ? Math.max(taskAlignment, 0.8)
      : taskAlignment
  const workCategory =
    !isDistracted && DISTRACTION_CATEGORY_NAMES.includes(validCategory)
      ? resolveFallbackWorkCategory(ctx.categories)
      : validCategory
  const distractionCheck = {
    ...(hasDistractionCheckObject ? analysis.distraction_check : {}),
    is_distracted: isDistracted,
    reason,
    task_alignment: finalAlignment,
  }

  // category は DB 側に CHECK 制約があるため、許可3値へ正規化する
  const rawCategory = typeof analysis?.category === "string" ? analysis.category.toLowerCase().trim() : ""
  const normalizedCategory = (["productive", "distracted", "neutral"].includes(rawCategory) ? rawCategory : "neutral") as
    | "productive"
    | "distracted"
    | "neutral"
  // is_distracted と category が食い違わないよう、distracted と判定したら category も distracted にする。
  // 逆に脱線ではないのに distracted のままだと「生産的ログの割合」がずれるので戻す
  // （予定作業どおりの買い物は productive、それ以外は neutral。2026-10-06 実モデル確認で食い違いが出た）
  const category = isDistracted
    ? "distracted"
    : plannedLeisure
      ? "productive"
      : normalizedCategory === "distracted"
        ? "neutral"
        : normalizedCategory

  // applications は TEXT[] 列のため、文字列のみに整形する。プロンプトの指示（最大5件）に合わせ、
  // 前後空白を除いて重複を落とし、5件までにする
  const normalizedApps: string[] = Array.isArray(analysis?.apps)
    ? [
        ...new Set<string>(
          analysis.apps
            .filter((a: unknown): a is string => typeof a === "string")
            .map((a: string) => a.trim())
            .filter((a: string) => a.length > 0),
        ),
      ].slice(0, MAX_APPS)
    : []

  // details はプロンプトで文字数を指定しているが、モデルが守らないことがあるので切り詰める
  // （サロゲートペア・絵文字を壊さないよう、文字単位で数える）
  const rawDetails = typeof analysis?.details === "string" ? analysis.details.trim() : ""
  const maxDetails = ctx.detailsMaxLength ?? DEFAULT_DETAILS_MAX
  const detailChars = Array.from(rawDetails)
  const details = rawDetails
    ? detailChars.length > maxDetails
      ? detailChars.slice(0, maxDetails - 1).join("") + "…"
      : rawDetails
    : ctx.fallbackDetails

  return {
    activity: typeof analysis?.activity === "string" && analysis.activity.trim() ? analysis.activity.trim() : ctx.fallbackActivity,
    category,
    work_category: workCategory,
    details,
    confidence: Math.round(confidence * 100),
    applications: normalizedApps,
    focus_score: Math.round(finalAlignment * 100),
    distraction_check: distractionCheck,
  }
}

// ---- 予定作業との照合（2 段目の文字だけの確認） ---------------------------------
// 画像を見ながら「予定作業と同じ業務か」まで一度に判断させると、小型モデルは
// 仕事らしい画面なら一致と見なしやすい（2026-10-05 実測：予定「経理の請求書処理」で
// 画面がコード／開発ドキュメントでも「生産的・一致度 100」）。そこで、1 段目で
// 「脱線ではない」と判定された回に限り、抽出済みの活動内容と予定作業を文字だけで
// 比べさせる。ユーザー定義ルールがあるときはルールを優先し、この確認はしない。

export interface TaskMatchInput {
  currentTask: string
  activity: string
  details: string
  applications: string[]
  /** 有効なユーザー定義ルール（0 件なら省略可）。ルールに当てはまる作業は一致扱いにする */
  userRules?: string[]
}

/**
 * 2 段目の確認が必要か（予定作業あり・1 段目で脱線ではない）。
 * ユーザー定義ルールの有無では止めない。以前は「ルールあり」で確認を丸ごと省いていたため、
 * ルールを 1 件でも登録した利用者には別業務の見逃し対策が効かなかった。
 * ルールは buildTaskMatchPrompt に渡して、2 段目の判断の中で優先させる
 */
export function needsTaskMatchCheck(result: AnalysisResult, currentTask: string): boolean {
  if (!currentTask.trim() || result.distraction_check.is_distracted) return false
  // 予定作業どおりの買い物・動画など（1 段目でコード側が確定した回）は、2 段目で覆さない
  return !isPlannedLeisure({ apps: result.applications, activity: result.activity }, currentTask)
}

export function buildTaskMatchPrompt(input: TaskMatchInput): string {
  const apps = input.applications.length > 0 ? `／使用アプリ: ${input.applications.join("、")}` : ""
  const rules = (input.userRules ?? []).map((r) => r.trim()).filter((r) => r.length > 0)
  const rulesNote =
    rules.length > 0
      ? `

【ユーザー定義の判定ルール】次のルールに当てはまる場合は、ルールを優先して yes と答えてください。
${rules.map((r) => `- ${r}`).join("\n")}`
      : ""
  // 2026-10-05 の実画面テストで、要約が一般的（「コード編集」等）なだけで no と答え、
  // 予定作業どおりの作業に誤アラートが出た。迷ったら脱線にしない側に倒す
  return `予定作業と、いま画面で行われている作業を比べてください。

予定作業: "${input.currentTask}"
画面の作業: ${input.activity}（${input.details}）${apps}${rulesNote}

画面の作業が、予定作業そのもの、または予定作業を進めるために直接必要な作業なら yes と答えてください。
no と答えるのは、画面の作業が予定作業と明らかに別の業務・別のテーマだと分かる場合だけです。
説明が一般的（例：コード編集、ブラウザ閲覧、ドキュメント閲覧、チャット確認）で、予定作業と矛盾すると断定できない場合は yes と答えてください。
仕事らしい作業でも、予定作業と明らかに別の業務なら no です。

画面の作業が FlowNudge（この集中支援アプリ）の画面の確認であれば yes と答えてください。

例1: 予定作業「ac)flownudgeのシステム調整」、画面の作業「コード編集（コードエディタでコードを編集している）」
  → 予定作業と矛盾しないので yes
例2: 予定作業「経理の請求書処理」、画面の作業「コード編集（next.js のコードを閲覧）」
  → 明らかに別の業務なので no

yes か no の1語だけで答えてください。`
}

/** 2 段目の回答を解釈する。yes→true（一致）、no→false（別作業）、読めなければ null（判定を変えない） */
export function parseTaskMatchAnswer(text: string): boolean | null {
  const s = (text || "").trim().toLowerCase().replace(/^[`"'「『\s]+/, "")
  if (/^(yes|はい)/.test(s)) return true
  if (/^(no|いいえ)/.test(s)) return false
  return null
}

/** 2 段目で「別の作業」と分かったときに、判定を脱線へ書き換える */
export function applyTaskMismatch(result: AnalysisResult, reasonOffTask: string): AnalysisResult {
  const alignment = Math.min(result.distraction_check.task_alignment, 0.3)
  return {
    ...result,
    category: "distracted",
    focus_score: Math.round(alignment * 100),
    distraction_check: {
      ...result.distraction_check,
      is_distracted: true,
      task_alignment: alignment,
      reason: reasonOffTask,
    },
  }
}
