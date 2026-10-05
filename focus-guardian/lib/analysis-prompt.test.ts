// lib/analysis-prompt.ts の純関数テスト。
// 依存追加禁止のため Node 組み込みの node:test + node:assert/strict を使う。
// 実行: node --experimental-strip-types --test lib/analysis-prompt.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  buildAnalysisPrompt,
  normalizeAnalysis,
  DEFAULT_CATEGORY_NAMES,
  type NormalizeContext,
  needsTaskMatchCheck,
  buildTaskMatchPrompt,
  parseTaskMatchAnswer,
  applyTaskMismatch,
  detectLeisureSite,
} from "./analysis-prompt.ts"

function baseCtx(overrides: Partial<NormalizeContext> = {}): NormalizeContext {
  return {
    currentTask: "資料作成",
    categories: DEFAULT_CATEGORY_NAMES,
    fallbackDetails: "FALLBACK_DETAILS",
    fallbackActivity: "FALLBACK_ACTIVITY",
    reasonLowAlignment: "REASON_LOW_ALIGNMENT",
    reasonUnknown: "REASON_UNKNOWN",
    ...overrides,
  }
}

// ---- task_alignment / confidence の数値解釈（H-4） ----

test("task_alignment: 0 は 0.5 に化けない", () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: 0, is_distracted: false } }, baseCtx())
  assert.equal(r.distraction_check.task_alignment, 0)
  assert.equal(r.focus_score, 0)
})

test('task_alignment: 文字列 "0.1" を数値として解釈する', () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: "0.1", is_distracted: false } }, baseCtx())
  assert.equal(r.distraction_check.task_alignment, 0.1)
})

test("task_alignment: 10 は 0〜100 スケールとみなして /100 する", () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: 10, is_distracted: false } }, baseCtx())
  assert.equal(r.distraction_check.task_alignment, 0.1)
})

test("task_alignment: 80 は 0.8 になる", () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: 80, is_distracted: false } }, baseCtx())
  assert.equal(r.distraction_check.task_alignment, 0.8)
})

test('task_alignment: "80%" は 0.8 になる', () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: "80%", is_distracted: false } }, baseCtx())
  assert.equal(r.distraction_check.task_alignment, 0.8)
})

test("task_alignment: -1 は 0 にクランプされる", () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: -1, is_distracted: false } }, baseCtx())
  assert.equal(r.distraction_check.task_alignment, 0)
})

test("task_alignment: 2 は 1 より大きいので /100 され 0〜1 に収まる", () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: 2, is_distracted: false } }, baseCtx())
  assert.ok(r.distraction_check.task_alignment >= 0 && r.distraction_check.task_alignment <= 1)
  assert.equal(r.distraction_check.task_alignment, 0.02)
})

test("task_alignment: NaN は既定値 0.5 になる", () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: NaN, is_distracted: false } }, baseCtx())
  assert.equal(r.distraction_check.task_alignment, 0.5)
})

test("task_alignment: 欠落時は既定値 0.5 になる", () => {
  const r = normalizeAnalysis({ distraction_check: { is_distracted: false } }, baseCtx())
  assert.equal(r.distraction_check.task_alignment, 0.5)
})

test("confidence: 0 は 0.5 に化けない", () => {
  const r = normalizeAnalysis({ confidence: 0, distraction_check: { is_distracted: false, task_alignment: 0.9 } }, baseCtx())
  assert.equal(r.confidence, 0)
})

test('confidence: 文字列 "0.1" を数値として解釈する', () => {
  const r = normalizeAnalysis({ confidence: "0.1", distraction_check: { is_distracted: false, task_alignment: 0.9 } }, baseCtx())
  assert.equal(r.confidence, 10)
})

test("confidence: 80 は 0〜100 スケールとみなして 80 になる（0.8 * 100）", () => {
  const r = normalizeAnalysis({ confidence: 80, distraction_check: { is_distracted: false, task_alignment: 0.9 } }, baseCtx())
  assert.equal(r.confidence, 80)
})

test('confidence: "80%" は 80 になる', () => {
  const r = normalizeAnalysis({ confidence: "80%", distraction_check: { is_distracted: false, task_alignment: 0.9 } }, baseCtx())
  assert.equal(r.confidence, 80)
})

test("confidence: -1 は 0 にクランプされる", () => {
  const r = normalizeAnalysis({ confidence: -1, distraction_check: { is_distracted: false, task_alignment: 0.9 } }, baseCtx())
  assert.equal(r.confidence, 0)
})

test("confidence: NaN・欠落は既定値 0.5(=50) になる", () => {
  const r1 = normalizeAnalysis({ confidence: NaN, distraction_check: { is_distracted: false, task_alignment: 0.9 } }, baseCtx())
  const r2 = normalizeAnalysis({ distraction_check: { is_distracted: false, task_alignment: 0.9 } }, baseCtx())
  assert.equal(r1.confidence, 50)
  assert.equal(r2.confidence, 50)
})

// ---- work_category のフォールバック（H-3） ----

test("work_category: 一覧外なら「未分類」に落ちる", () => {
  const r = normalizeAnalysis(
    { work_category: "フォト編集", distraction_check: { is_distracted: false, task_alignment: 0.9 } },
    baseCtx(),
  )
  assert.equal(r.work_category, "未分類")
})

test("work_category: 前後に空白があってもマッチする", () => {
  const r = normalizeAnalysis(
    { work_category: " リサーチ ", distraction_check: { is_distracted: false, task_alignment: 0.9 } },
    baseCtx(),
  )
  assert.equal(r.work_category, "リサーチ")
})

test("work_category: 大文字小文字の違いを無視してマッチし、一覧の表記で返す", () => {
  const r = normalizeAnalysis(
    { work_category: "research", distraction_check: { is_distracted: false, task_alignment: 0.9 } },
    baseCtx({ categories: ["Research", "Other"] }),
  )
  assert.equal(r.work_category, "Research")
})

test("work_category: ctx.categories が空配列でも「未分類」に落ちる（末尾を拾わない）", () => {
  const r = normalizeAnalysis(
    { work_category: "リサーチ", distraction_check: { is_distracted: false, task_alignment: 0.9 } },
    baseCtx({ categories: [] }),
  )
  assert.equal(r.work_category, "未分類")
})

test("work_category: 一覧の末尾（ユーザー追加カテゴリ）を無条件に拾わない", () => {
  const r = normalizeAnalysis(
    { work_category: "存在しないカテゴリ", distraction_check: { is_distracted: false, task_alignment: 0.9 } },
    baseCtx({ categories: ["リサーチ", "ユーザーが追加した新カテゴリ"] }),
  )
  assert.equal(r.work_category, "未分類")
})

// ---- 判定の優先順位（H-5 / H-6） ----

test("(a) hasUserRules: true + is_distracted: false + task_alignment: 0.1 → distracted にならない", () => {
  const r = normalizeAnalysis(
    { category: "productive", distraction_check: { is_distracted: false, task_alignment: 0.1, reason: "" } },
    baseCtx({ hasUserRules: true }),
  )
  assert.equal(r.distraction_check.is_distracted, false)
  assert.equal(r.category, "productive")
})

test("(b) hasUserRules なし + is_distracted: true → distracted になる", () => {
  const r = normalizeAnalysis(
    { category: "neutral", distraction_check: { is_distracted: true, task_alignment: 0.9, reason: "SNS" } },
    baseCtx(),
  )
  assert.equal(r.distraction_check.is_distracted, true)
  assert.equal(r.category, "distracted")
})

test("(c) is_distracted を返さない + currentTask あり + task_alignment: 0.1 → distracted になる（閾値補完）", () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: 0.1, reason: "" } }, baseCtx({ currentTask: "資料作成" }))
  assert.equal(r.distraction_check.is_distracted, true)
  assert.equal(r.category, "distracted")
})

test("(d) currentTask が空文字なら、is_distracted 欠落 + task_alignment 低くても強制 distracted が立たない", () => {
  const r = normalizeAnalysis({ distraction_check: { task_alignment: 0.1, reason: "" } }, baseCtx({ currentTask: "" }))
  assert.equal(r.distraction_check.is_distracted, false)
})

test("is_distracted が型違い（文字列）のときも閾値補完の扱いになる", () => {
  const r = normalizeAnalysis(
    { distraction_check: { is_distracted: "true", task_alignment: 0.9 } },
    baseCtx({ currentTask: "資料作成" }),
  )
  // task_alignment が高いので閾値補完では distracted にならない
  assert.equal(r.distraction_check.is_distracted, false)
})

// ---- category と is_distracted の整合、reason の空文字フォールバック ----

test("強制 distracted のとき category も distracted になる", () => {
  const r = normalizeAnalysis(
    { category: "productive", distraction_check: { task_alignment: 0.1 } },
    baseCtx({ currentTask: "資料作成" }),
  )
  assert.equal(r.distraction_check.is_distracted, true)
  assert.equal(r.category, "distracted")
})

test("強制 distracted のとき reason が空文字のままにならない（reasonLowAlignment にフォールバック）", () => {
  const r = normalizeAnalysis(
    { distraction_check: { task_alignment: 0.1, reason: "" } },
    baseCtx({ currentTask: "資料作成", reasonLowAlignment: "REASON_LOW_ALIGNMENT" }),
  )
  assert.equal(r.distraction_check.reason, "REASON_LOW_ALIGNMENT")
})

test("distraction_check 自体が無いときも reason が reasonUnknown にフォールバックする", () => {
  const r = normalizeAnalysis({}, baseCtx({ currentTask: "", reasonUnknown: "REASON_UNKNOWN" }))
  assert.equal(r.distraction_check.reason, "REASON_UNKNOWN")
  assert.equal(r.distraction_check.is_distracted, false)
})

// ---- buildAnalysisPrompt ----

test("buildAnalysisPrompt: 優先順位が番号付きで入っている", () => {
  const prompt = buildAnalysisPrompt({ currentTask: "資料作成", categories: DEFAULT_CATEGORY_NAMES, userRules: [], multiScreen: false, lang: "ja" })
  assert.ok(prompt.includes("1. "))
  assert.ok(prompt.includes("2. "))
  assert.ok(prompt.includes("3. "))
})

test("buildAnalysisPrompt: 閾値 0.35 の文字列が含まれない", () => {
  const prompt = buildAnalysisPrompt({ currentTask: "資料作成", categories: DEFAULT_CATEGORY_NAMES, userRules: [], multiScreen: false, lang: "ja" })
  assert.ok(!prompt.includes("0.35"))
})

test("buildAnalysisPrompt: currentTask が空なら「未設定」が入る", () => {
  const prompt = buildAnalysisPrompt({ currentTask: "", categories: DEFAULT_CATEGORY_NAMES, userRules: [], multiScreen: false, lang: "ja" })
  assert.ok(prompt.includes('"未設定"'))
})

test("buildAnalysisPrompt: userRules が0件でもルールの行が追加されない（プロンプトが膨らまない）", () => {
  const withRules = buildAnalysisPrompt({
    currentTask: "資料作成",
    categories: DEFAULT_CATEGORY_NAMES,
    userRules: ["Amazonは出品作業なので作業中扱い"],
    multiScreen: false,
    lang: "ja",
  })
  const withoutRules = buildAnalysisPrompt({
    currentTask: "資料作成",
    categories: DEFAULT_CATEGORY_NAMES,
    userRules: [],
    multiScreen: false,
    lang: "ja",
  })
  assert.ok(withRules.includes("Amazonは出品作業なので作業中扱い"))
  assert.ok(!withoutRules.includes("Amazonは出品作業なので作業中扱い"))
  assert.ok(withoutRules.length < withRules.length)
})

// ---- 2026-10-05 実画面テストで見つかった不具合の回帰防止 ----

test("reason: モデルが is_distracted:false を明示して理由が空なら、「判定できませんでした」を入れない", () => {
  const r = normalizeAnalysis({ distraction_check: { is_distracted: false, reason: "", task_alignment: 0.9 } }, baseCtx())
  assert.equal(r.distraction_check.is_distracted, false)
  assert.equal(r.distraction_check.reason, "")
})

test("reason: モデルが is_distracted:true で理由が空なら、既定文（一致度が低い）を入れる", () => {
  const r = normalizeAnalysis({ distraction_check: { is_distracted: true, reason: "" } }, baseCtx())
  assert.equal(r.distraction_check.reason, "REASON_LOW_ALIGNMENT")
})

test("details: 既定の上限（40文字）を超えたら切り詰めて末尾に … を付ける", () => {
  const long = "あ".repeat(60)
  const r = normalizeAnalysis({ details: long }, baseCtx())
  assert.equal(Array.from(r.details).length, 40)
  assert.ok(r.details.endsWith("…"))
})

test("details: detailsMaxLength を指定するとその文字数まで許す（英語 UI 用）", () => {
  const s = "a".repeat(70)
  assert.equal(normalizeAnalysis({ details: s }, baseCtx({ detailsMaxLength: 80 })).details, s)
})

test("details: 絵文字（サロゲートペア）を途中で壊さない", () => {
  const r = normalizeAnalysis({ details: "😀".repeat(50) }, baseCtx())
  assert.equal(Array.from(r.details).length, 40)
  assert.ok(!r.details.includes("�"))
})

test("apps: 前後空白を除き、重複を落とし、最大5件にする", () => {
  const r = normalizeAnalysis({ apps: [" Chrome ", "Chrome", "YouTube", "", 3, "A", "B", "C", "D"] }, baseCtx())
  assert.deepEqual(r.applications, ["Chrome", "YouTube", "A", "B", "C"])
})

test("buildAnalysisPrompt: 予定作業と別の業務なら仕事でも脱線、という照合ルールが入っている", () => {
  const p = buildAnalysisPrompt({ currentTask: "経理の請求書処理", categories: DEFAULT_CATEGORY_NAMES, userRules: [], multiScreen: false, lang: "ja" })
  assert.match(p, /別の業務・別のテーマなら is_distracted は true/)
})

test("buildAnalysisPrompt: apps の例示に特定のアプリ名（VS Code など）を入れない（モデルが引きずられて捏造するため）", () => {
  const p = buildAnalysisPrompt({ currentTask: "", categories: DEFAULT_CATEGORY_NAMES, userRules: [], multiScreen: false, lang: "ja" })
  assert.ok(!/VS Code/.test(p))
  assert.match(p, /見えないものを推測で書かない/)
})

// ---- 2 段目：予定作業との照合 ----

const notDistracted = () =>
  normalizeAnalysis(
    { activity: "コード編集", category: "productive", details: "コードを閲覧", apps: ["GitHub"], distraction_check: { is_distracted: false, task_alignment: 1 } },
    baseCtx({ currentTask: "経理の請求書処理" }),
  )

test("needsTaskMatchCheck: 予定作業あり・脱線ではない、のときに確認する（ルールの有無では止めない）", () => {
  const r = notDistracted()
  assert.equal(needsTaskMatchCheck(r, "経理の請求書処理"), true)
  assert.equal(needsTaskMatchCheck(r, ""), false)
  assert.equal(needsTaskMatchCheck(r, "   "), false)
  assert.equal(needsTaskMatchCheck(applyTaskMismatch(r, "X"), "経理の請求書処理"), false)
})

test("buildTaskMatchPrompt: 予定作業・活動・要約・アプリ名と yes/no の指示が入る。ルール 0 件ならルール欄は出ない", () => {
  const p = buildTaskMatchPrompt({ currentTask: "経理の請求書処理", activity: "コード編集", details: "コードを閲覧", applications: ["GitHub"] })
  assert.match(p, /予定作業: "経理の請求書処理"/)
  assert.match(p, /画面の作業: コード編集（コードを閲覧）／使用アプリ: GitHub/)
  assert.match(p, /yes か no の1語だけ/)
  assert.ok(!/ユーザー定義の判定ルール/.test(p))
  const p2 = buildTaskMatchPrompt({ currentTask: "x", activity: "a", details: "d", applications: [], userRules: ["  ", ""] })
  assert.ok(!/ユーザー定義の判定ルール/.test(p2))
})

test("buildTaskMatchPrompt: ユーザー定義ルールがあれば本文が入り、ルール優先で yes と答える指示になる", () => {
  const p = buildTaskMatchPrompt({
    currentTask: "経理の請求書処理",
    activity: "コード編集",
    details: "コードを閲覧",
    applications: [],
    userRules: ["GitHub を見るのは仕事", " Slack の確認も仕事 "],
  })
  assert.match(p, /【ユーザー定義の判定ルール】次のルールに当てはまる場合は、ルールを優先して yes/)
  assert.match(p, /- GitHub を見るのは仕事\n- Slack の確認も仕事/)
})

test("parseTaskMatchAnswer: yes/no/はい/いいえ を読み、それ以外は null", () => {
  assert.equal(parseTaskMatchAnswer("yes"), true)
  assert.equal(parseTaskMatchAnswer(" Yes."), true)
  assert.equal(parseTaskMatchAnswer("はい"), true)
  assert.equal(parseTaskMatchAnswer("no"), false)
  assert.equal(parseTaskMatchAnswer("No, it is different"), false)
  assert.equal(parseTaskMatchAnswer("「いいえ」"), false)
  assert.equal(parseTaskMatchAnswer("わかりません"), null)
  assert.equal(parseTaskMatchAnswer(""), null)
})

test("applyTaskMismatch: 脱線に書き換え、一致度は 0.3 以下、理由は指定文", () => {
  const r = applyTaskMismatch(notDistracted(), "OFF_TASK")
  assert.equal(r.category, "distracted")
  assert.equal(r.distraction_check.is_distracted, true)
  assert.equal(r.distraction_check.task_alignment, 0.3)
  assert.equal(r.focus_score, 30)
  assert.equal(r.distraction_check.reason, "OFF_TASK")
  assert.equal(r.activity, "コード編集")
})

// ---- 2026-10-05 実画面テストの誤アラート（要約が一般的なだけで no）への対策 ----

test("buildTaskMatchPrompt: 迷ったら脱線にしない指示と、実データに基づく例 2 つが入る", () => {
  const p = buildTaskMatchPrompt({ currentTask: "x", activity: "a", details: "d", applications: [] })
  assert.match(p, /no と答えるのは、画面の作業が予定作業と明らかに別の業務・別のテーマだと分かる場合だけ/)
  assert.match(p, /予定作業と矛盾すると断定できない場合は yes/)
  assert.match(p, /例1: 予定作業「ac\)flownudgeのシステム調整」[\s\S]*→ 予定作業と矛盾しないので yes/)
  assert.match(p, /例2: 予定作業「経理の請求書処理」[\s\S]*→ 明らかに別の業務なので no/)
})

// 2026-10-06 実モデル確認：1 段目の誤った理由（「予定作業に関連」）に 2 段目が引きずられたため渡さない
test("buildTaskMatchPrompt: 1 段目の判断理由は入れない", () => {
  const p = buildTaskMatchPrompt({ currentTask: "x", activity: "a", details: "d", applications: [] })
  assert.ok(!/1 段目の判断理由/.test(p))
})

// ---- FlowNudge 自身の画面が「作業効率モニタリングシステム」と言い換えられる問題（2026-10-05） ----

test("buildAnalysisPrompt: 冒頭でシステム自身を名乗らず、FlowNudge の画面は脱線扱いにしないルールが入る", () => {
  const p = buildAnalysisPrompt({ currentTask: "x", categories: DEFAULT_CATEGORY_NAMES, userRules: [], multiScreen: false, lang: "ja" })
  assert.ok(!/作業効率モニタリングシステム/.test(p))
  assert.match(p, /FlowNudge（この集中支援アプリ[^）]*）が表示されているときは[\s\S]*それ自体は脱線扱いにしない/)
  assert.match(p, /^1\. /m); assert.match(p, /^2\. /m); assert.match(p, /^3\. /m); assert.match(p, /^4\. /m)
})

test("buildTaskMatchPrompt: FlowNudge の画面の確認は yes のルールが入る", () => {
  const p = buildTaskMatchPrompt({ currentTask: "x", activity: "a", details: "d", applications: [] })
  assert.match(p, /FlowNudge（この集中支援アプリ）の画面の確認であれば yes/)
})

// ---- 予定作業に関わらず脱線のサイトをコード側で確定する（2026-10-06 実モデル確認：Amazon を「関連」と誤答） ----

test("detectLeisureSite: apps・activity に動画・SNS・買い物サイトがあれば名前を返す", () => {
  assert.equal(detectLeisureSite({ apps: ["Chrome", "Amazon"], activity: "商品閲覧" }), "Amazon")
  assert.equal(detectLeisureSite({ apps: [], activity: "YouTubeで動画視聴" }), "YouTube")
  assert.equal(detectLeisureSite({ apps: ["楽天市場"] }), "楽天")
  assert.equal(detectLeisureSite({ apps: ["X (旧Twitter)"] }), "X (Twitter)")
})

test("detectLeisureSite: 業務でも使う名前（AWS・YouTube Studio・楽天銀行）や details だけの言及では反応しない", () => {
  assert.equal(detectLeisureSite({ apps: ["Amazon Web Services"], activity: "EC2 設定" }), null)
  assert.equal(detectLeisureSite({ apps: ["AWS Console (Amazon)"] }), null)
  assert.equal(detectLeisureSite({ apps: ["YouTube Studio"] }), null)
  assert.equal(detectLeisureSite({ apps: ["楽天銀行"] }), null)
  assert.equal(detectLeisureSite({ apps: ["VS Code"], activity: "コード編集", details: "YouTube API の実装" }), null)
  assert.equal(detectLeisureSite({}), null)
})

test("normalizeAnalysis: モデルが脱線ではないと答えても、Amazon の画面なら脱線・低い集中度・専用の理由になる", () => {
  const r = normalizeAnalysis(
    { activity: "商品閲覧", apps: ["Amazon"], distraction_check: { is_distracted: false, task_alignment: 0.7, reason: "予定作業に関連する可能性" } },
    baseCtx({ currentTask: "flownudgeのシステム調整", reasonLeisureSite: "REASON_LEISURE" }),
  )
  assert.equal(r.distraction_check.is_distracted, true)
  assert.ok(r.distraction_check.task_alignment <= 0.2)
  assert.ok(r.focus_score <= 20)
  assert.equal(r.distraction_check.reason, "REASON_LEISURE")
})

test("normalizeAnalysis: モデルも脱線と答えていればモデルの理由を残す。予定作業が未設定でも脱線になる", () => {
  const r = normalizeAnalysis(
    { activity: "動画視聴", apps: ["YouTube"], distraction_check: { is_distracted: true, task_alignment: 0.1, reason: "動画を視聴" } },
    baseCtx({ currentTask: "", reasonLeisureSite: "REASON_LEISURE" }),
  )
  assert.equal(r.distraction_check.is_distracted, true)
  assert.equal(r.distraction_check.reason, "動画を視聴")
})

test("normalizeAnalysis: ユーザー定義ルールがあるときはサイト判定を適用せず、モデルの判断（ルール込み）に従う", () => {
  const r = normalizeAnalysis(
    { activity: "講義動画", apps: ["YouTube"], distraction_check: { is_distracted: false, task_alignment: 0.8, reason: "ルールにより業務" } },
    baseCtx({ hasUserRules: true }),
  )
  assert.equal(r.distraction_check.is_distracted, false)
  assert.equal(r.distraction_check.reason, "ルールにより業務")
})

// ---- サイト判定の誤検知・見逃し（2026-10-06 レビュー指摘） ----

test("detectLeisureSite: x.com・5ch は語の境界で判定し、dropbox.com 等に反応しない", () => {
  for (const app of ["dropbox.com", "box.com", "fedex.com", "linux.com", "abc5ch"]) {
    assert.equal(detectLeisureSite({ apps: [app] }), null, app)
  }
  assert.equal(detectLeisureSite({ apps: ["x.com"] }), "X (Twitter)")
  assert.equal(detectLeisureSite({ apps: ["5ch"] }), "5ch")
})

test("detectLeisureSite: activity は閲覧・視聴・買い物の語と一緒のときだけ見る（業務の文脈は脱線にしない）", () => {
  assert.equal(detectLeisureSite({ apps: ["VS Code"], activity: "YouTube Data API の実装" }), null)
  assert.equal(detectLeisureSite({ apps: ["Chrome"], activity: "Amazon の請求書ダウンロード" }), null)
  assert.equal(detectLeisureSite({ apps: ["Chrome"], activity: "YouTubeで動画視聴" }), "YouTube")
  assert.equal(detectLeisureSite({ apps: ["Chrome"], activity: "Amazonで商品閲覧" }), "Amazon")
})

test("detectLeisureSite: FlowNudge の画面（過去ログに YouTube 等が並ぶ）では判定しない", () => {
  assert.equal(detectLeisureSite({ apps: ["FlowNudge", "YouTube"], activity: "FlowNudge の画面" }), null)
})

test("detectLeisureSite: 除外は要素ごと。AWS Console と Amazon.co.jp が並べば買い物として検出する", () => {
  assert.equal(detectLeisureSite({ apps: ["AWS Console", "Amazon.co.jp"] }), "Amazon")
  assert.equal(detectLeisureSite({ apps: ["Amazon Seller Central"] }), null)
})

test("normalizeAnalysis: モデルが脱線と答えて理由が空なら、一致度の文言ではなくサイト用の理由にする", () => {
  const r = normalizeAnalysis(
    { activity: "動画視聴", apps: ["YouTube"], distraction_check: { is_distracted: true, task_alignment: 0.1, reason: "" } },
    baseCtx({ currentTask: "", reasonLeisureSite: "REASON_LEISURE" }),
  )
  assert.equal(r.distraction_check.reason, "REASON_LEISURE")
})

test("buildAnalysisPrompt: FlowNudge の画面の書き方は出力言語に合わせる（英語 UI に日本語が混ざらない）", () => {
  const en = buildAnalysisPrompt({ currentTask: "x", categories: DEFAULT_CATEGORY_NAMES, userRules: [], lang: "en" } as any)
  assert.match(en, /「FlowNudge screen」/)
  assert.ok(!/「FlowNudge の画面」/.test(en))
  const ja = buildAnalysisPrompt({ currentTask: "x", categories: DEFAULT_CATEGORY_NAMES, userRules: [], lang: "ja" } as any)
  assert.match(ja, /「FlowNudge の画面」/)
})


// ---- 英語 UI（2026-10-06 実モデル確認：日本語で答える・作業種類の一覧を読めない） ----

test("buildAnalysisPrompt: 英語のときだけ末尾に英語で書く念押しが入る", () => {
  const en = buildAnalysisPrompt({ currentTask: "x", categories: DEFAULT_CATEGORY_NAMES, userRules: [], lang: "en" } as any)
  assert.match(en, /IMPORTANT: Write "activity", "details" and "reason" in English/)
  const ja = buildAnalysisPrompt({ currentTask: "x", categories: DEFAULT_CATEGORY_NAMES, userRules: [], lang: "ja" } as any)
  assert.ok(!/IMPORTANT/.test(ja))
})

test("normalizeAnalysis: 脱線ではない回に「娯楽」「業務以外のSNS」が付いたら未分類に戻す。脱線の回はそのまま", () => {
  const notDistracted = normalizeAnalysis(
    { activity: "Code editing", work_category: "業務以外のSNS", distraction_check: { is_distracted: false, task_alignment: 0.9 } },
    baseCtx(),
  )
  assert.equal(notDistracted.work_category, "未分類")
  const distracted = normalizeAnalysis(
    { activity: "動画視聴", apps: ["YouTube"], work_category: "娯楽", distraction_check: { is_distracted: true, task_alignment: 0.1 } },
    baseCtx(),
  )
  assert.equal(distracted.work_category, "娯楽")
  const research = normalizeAnalysis({ work_category: "リサーチ", distraction_check: { is_distracted: false, task_alignment: 0.9 } }, baseCtx())
  assert.equal(research.work_category, "リサーチ")
})
