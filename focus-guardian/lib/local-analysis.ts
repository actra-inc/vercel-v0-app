// 画面解析の 2 段目（予定作業との照合）を端末内 AI で行う（クライアント専用）。
// 失敗・タイムアウト・読めない回答のときは 1 段目の判定をそのまま返す（判定を悪化させない）。

import { runLocalPrompt } from "@/lib/local-ai"
import {
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
        firstStageReason: result.distraction_check.reason,
      }),
      timeoutMs: TASK_MATCH_TIMEOUT_MS,
    })
    return parseTaskMatchAnswer(answer) === false ? applyTaskMismatch(result, opts.reasonOffTask) : result
  } catch (e) {
    console.warn("Task-match check failed; keeping the first-stage result:", e instanceof Error ? e.message : e)
    return result
  }
}
