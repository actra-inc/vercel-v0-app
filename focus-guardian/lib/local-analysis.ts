// 画面解析の 2 段目（予定作業との照合）を端末内 AI で行う（クライアント専用）。
// 失敗・タイムアウト・読めない回答のときは 1 段目の判定をそのまま返す（判定を悪化させない）。

import { extractJsonObject, runLocalPrompt } from "@/lib/local-ai"
import {
  isUnusableAnalysis,
  applyTaskMismatch,
  buildTaskMatchPrompt,
  needsTaskMatchCheck,
  parseTaskMatchAnswer,
  type AnalysisResult,
} from "@/lib/analysis-prompt"

const TASK_MATCH_TIMEOUT_MS = 30_000

export async function verifyTaskMatchLocal(
  result: AnalysisResult,
  opts: { currentTask: string; userRules?: string[]; lang: "ja" | "en"; reasonOffTask: string },
): Promise<AnalysisResult> {
  if (!needsTaskMatchCheck(result, opts.currentTask)) return result
  try {
    const answer = await runLocalPrompt({
      lang: opts.lang,
      text: buildTaskMatchPrompt({
        currentTask: opts.currentTask.trim(),
        activity: result.activity,
        details: result.details,
        applications: result.applications,
        userRules: opts.userRules ?? [],
        // 1 段目の判定理由は渡さない。1 段目が「予定作業に関連」と誤答した回に、2 段目まで
        // 引きずられて別業務を見逃した（2026-10-06 実モデル確認：予定「経理の請求書処理」で開発ドキュメント）
      }),
      timeoutMs: TASK_MATCH_TIMEOUT_MS,
    })
    return parseTaskMatchAnswer(answer) === false ? applyTaskMismatch(result, opts.reasonOffTask) : result
  } catch (e) {
    console.warn("Task-match check failed; keeping the first-stage result:", e instanceof Error ? e.message : e)
    return result
  }
}

const RETRY_NOTE = {
  ja: "\n\n注意：前の回答は判定結果ではなく説明文や雛形を書き写していました。画像を見て、各項目に実際の判定結果を入れてください。",
  en: "\n\nNote: the previous answer copied the instructions instead of judging the image. Look at the image and fill in each field with your actual judgment.",
}

/**
 * 画面解析の 1 段目（画像 → JSON）。使えない応答（読めない JSON・雛形の書き写し・脱線かどうかが無い）なら
 * 1 回だけ念押しを足してやり直す。それでも駄目なら parsed は null（呼び出し側は記録を保存しない）。
 * 推論自体の失敗（タイムアウト等）は例外のまま投げる
 */
export async function runAnalysisLocal(opts: {
  lang: "ja" | "en"
  image: Blob
  prompt: string
  timeoutMs: number
}): Promise<{ parsed: any | null; raw: string; attempts: number }> {
  let raw = ""
  for (let attempt = 1; attempt <= 2; attempt++) {
    raw = await runLocalPrompt({
      lang: opts.lang,
      image: opts.image,
      text: attempt === 1 ? opts.prompt : opts.prompt + RETRY_NOTE[opts.lang],
      timeoutMs: opts.timeoutMs,
    })
    const parsed = extractJsonObject(raw)
    if (parsed && !isUnusableAnalysis(parsed)) return { parsed, raw, attempts: attempt }
    console.warn(`On-device analysis: unusable answer (attempt ${attempt}/2)`)
  }
  return { parsed: null, raw, attempts: 2 }
}
