// 端末内 AI（Chrome 組み込み Prompt API / Gemini Nano）の薄いラッパー。
//
// このアプリの「ローカル動作版」では、画面解析・レポート生成の推論をすべて
// ブラウザ内のモデルで行う。画像もプロンプトも端末の外には出ない
// （Chrome の仕様: "No data is sent to Google or any third party when using the model"）。
//
// 責務:
//  - 利用可否（非対応ブラウザ / 要ダウンロード / ダウンロード中 / 利用可）の判定と購読
//  - モデルのダウンロード起動と進捗通知
//  - プロンプト実行の直列化（同時に複数の推論を投げない）
//  - JSON 応答の取り出し
//
// ここはクライアント専用。サーバー側からは import しないこと。

export type LocalAiAvailability = LanguageModelAvailability | "unsupported" | "unknown"

export interface LocalAiState {
  availability: LocalAiAvailability
  /** ダウンロード進捗 0〜1（ダウンロード中のみ） */
  downloadProgress: number | null
  /** 直近のエラー文（ユーザー向け文言は呼び出し側で i18n する） */
  lastError: string | null
}

// 画像入力＋日英テキスト入力、出力は UI 言語。availability() と create() に同じ条件を渡す
// （条件が違うと「availableと言われたのに create で失敗する」が起きる）
const coreOptions = (lang: "ja" | "en"): LanguageModelCreateCoreOptions => ({
  expectedInputs: [
    { type: "image" },
    { type: "text", languages: ["ja", "en"] },
  ],
  expectedOutputs: [{ type: "text", languages: [lang] }],
})

let state: LocalAiState = { availability: "unknown", downloadProgress: null, lastError: null }
const listeners = new Set<(s: LocalAiState) => void>()

function setState(patch: Partial<LocalAiState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}

export function getLocalAiState(): LocalAiState {
  return state
}

export function subscribeLocalAi(listener: (s: LocalAiState) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function api(): LanguageModelStatic | null {
  if (typeof window === "undefined") return null
  if (typeof LanguageModel === "undefined" || !LanguageModel) return null
  return LanguageModel
}

/** 利用可否を問い合わせて状態に反映する */
export async function refreshLocalAiAvailability(lang: "ja" | "en"): Promise<LocalAiAvailability> {
  const lm = api()
  if (!lm) {
    setState({ availability: "unsupported" })
    return "unsupported"
  }
  try {
    const a = await lm.availability(coreOptions(lang))
    // 直前の失敗理由は「使える」と確認できたときだけ消す
    // （create 失敗の直後に再確認すると、理由が表示される前に上書きされていた）
    setState(a === "available" ? { availability: a, lastError: null } : { availability: a })
    return a
  } catch (e) {
    setState({ availability: "unavailable", lastError: e instanceof Error ? e.message : String(e) })
    return "unavailable"
  }
}

// 言語ごとにベースセッションを1つ保持し、推論ごとに clone して使い捨てる
// （同じセッションに prompt を積むと文脈が溜まり、入力枠を食いつぶす）
const baseSessions = new Map<string, LanguageModelSession>()
let creating: Promise<LanguageModelSession> | null = null

async function getBaseSession(lang: "ja" | "en", signal?: AbortSignal): Promise<LanguageModelSession> {
  const existing = baseSessions.get(lang)
  if (existing) return existing
  // 既に別の呼び出しが作成中なら相乗りする。その場合この呼び出し自身のsignalは
  // 作成中のlm.create()には伝わらない（先行呼び出しのsignalで既に始まっているため）が、
  // creating自体はfinallyで必ずnullに戻るので、次の呼び出しは正常にやり直せる
  if (creating) return creating
  const lm = api()
  if (!lm) throw new Error("Prompt API is not available in this browser")

  creating = (async () => {
    try {
      const session = await lm.create({
        ...coreOptions(lang),
        // タイムアウト・呼び出し元のAbortをダウンロード待ちにも効かせる
        // （H-2: これが無いとtimeoutMsは「create完了後」からしか数えられず、
        //   モデル未ダウンロード環境でレポート生成が無期限に止まる）
        signal,
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            // e.loaded は 0〜1 の割合（total は 1）。ダウンロード不要な環境では即 1 が来る
            const ratio = e.total ? e.loaded / e.total : e.loaded
            setState({ availability: ratio >= 1 ? "available" : "downloading", downloadProgress: Math.min(1, ratio) })
          })
        },
      })
      baseSessions.set(lang, session)
      setState({ availability: "available", downloadProgress: null, lastError: null })
      return session
    } catch (e) {
      setState({ lastError: e instanceof Error ? e.message : String(e) })
      // 失敗理由を可否に反映し直す（容量不足などで unavailable に落ちていることがある）
      void refreshLocalAiAvailability(lang)
      throw e
    } finally {
      creating = null
    }
  })()
  return creating
}

/** モデルのダウンロードを開始する（ユーザー操作から呼ぶ）。完了で resolve */
export async function ensureLocalAiReady(lang: "ja" | "en"): Promise<void> {
  setState({ downloadProgress: state.availability === "available" ? null : 0 })
  await getBaseSession(lang)
}

// 推論は一度に1つだけ。画面解析と自動レポート生成が同時に走っても衝突しないよう直列化する
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

export interface LocalPromptInput {
  lang: "ja" | "en"
  text: string
  /** 画像を添えるとき（Blob / canvas / ImageBitmap など） */
  image?: LanguageModelImageValue
  /** 出力を拘束する JSON Schema */
  schema?: Record<string, unknown>
  /**
   * タイムアウト（ミリ秒）。順番待ちの時間は含めず、この推論の実行が始まった時点から数える
   * （先行する推論が長引いても、待っているだけの推論が実行前に打ち切られないようにする）
   */
  timeoutMs?: number
  /** 呼び出し側から中断したいとき（任意） */
  signal?: AbortSignal
}

const isAbort = (e: unknown) =>
  e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")

async function promptOnce(input: LocalPromptInput, useSchema: boolean, signal?: AbortSignal): Promise<string> {
  const base = await getBaseSession(input.lang, signal)
  const session = await base.clone({ signal })
  try {
    const content: LanguageModelMessageContent[] = []
    if (input.image) content.push({ type: "image", value: input.image })
    content.push({ type: "text", value: input.text })
    const options: LanguageModelPromptOptions = { signal }
    if (useSchema && input.schema) options.responseConstraint = input.schema
    return await session.prompt([{ role: "user", content }], options)
  } finally {
    session.destroy()
  }
}

/**
 * プロンプトを実行して生テキストを返す。
 * Gemini Nano は「The request is invalid」「kErrorUnknown」でまれに失敗する
 * （2026-10-01 の実測。特に複雑な JSON Schema を responseConstraint に付けたとき）。
 * 失敗したら、ベースセッションを作り直し・スキーマ無しで1回だけ再試行する。
 * 中断（タイムアウト・Abort）は再試行しない
 */
export async function runLocalPrompt(input: LocalPromptInput): Promise<string> {
  return enqueue(async () => {
    // タイムアウトは実行開始時点から数える（順番待ちの時間を含めない）
    const signals = [input.signal, input.timeoutMs ? AbortSignal.timeout(input.timeoutMs) : undefined].filter(
      (s): s is AbortSignal => !!s,
    )
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0]
    try {
      return await promptOnce(input, true, signal)
    } catch (e) {
      if (isAbort(e) || signal?.aborted) throw e
      console.warn("On-device prompt failed; retrying once with a fresh session and no schema:", e)
      const stale = baseSessions.get(input.lang)
      baseSessions.delete(input.lang)
      try {
        stale?.destroy()
      } catch {
        /* 既に破棄済み */
      }
      return await promptOnce(input, false, signal)
    }
  })
}

/** モデル出力から JSON オブジェクトを取り出す（コードフェンス・前置き文に耐える） */
export function extractJsonObject(text: string): any | null {
  if (!text) return null
  let s = text.trim()
  if (s.startsWith("```")) {
    s = s.replace(/```(?:json)?\n?/g, "").replace(/```\n?/g, "")
  }
  const match = s.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

/** 推論をやめてセッションを解放する（言語切替・ログアウト時） */
export function disposeLocalAi() {
  baseSessions.forEach((s) => {
    try {
      s.destroy()
    } catch {
      /* 既に破棄済み */
    }
  })
  baseSessions.clear()
}
