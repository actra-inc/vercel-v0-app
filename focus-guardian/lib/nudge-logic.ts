// 休憩・無操作リマインドの判定ロジック（純関数）。
// React の ref/state から切り離して node 単体テストで検証できるようにしている。
// work-log-panel.tsx の20秒チェッカーから呼ばれる

import type { NudgePreferences } from "@/lib/config"

export interface NudgeState {
  /** 実際に作業していた時間の積算（ms）。壁時計ではない */
  workedMs: number
  /** 次に休憩を提案する積算作業時間（ms） */
  breakThresholdMs: number
  lastTickAt: number | null
  /** 最後に「作業中」と判定した時刻 */
  lastWorkingAt: number | null
  /** 画面が最後に実際に変化した時刻（差分≥2%） */
  lastScreenChangeAt: number | null
  /** 最後に差分評価そのものを行った時刻（クールダウン等で評価できない間は更新されない） */
  lastDiffEvaluatedAt: number | null
  /** 無操作リマインドを現在のエピソードで既に出したか */
  idleFired: boolean
  /** 休憩スヌーズの期限 */
  snoozeUntil: number
}

export interface NudgeInput {
  now: number
  prefs: NudgePreferences
  captureIntervalSec: number
  /** 429クールダウン中（画面を評価できないので保守的に作業中とみなす） */
  inCooldown: boolean
  /** 映像供給が止まっている（スリープ・非表示）。作業していない扱い */
  sourcePaused: boolean
}

export interface NudgeResult {
  state: NudgeState
  fireBreak: { minutes: number } | null
  fireIdle: { minutes: number } | null
  /** 休憩・離席で連続作業が途切れたので、出ている休憩バナーを消してよい */
  clearBreakBanner: boolean
}

export function initialNudgeState(now: number, prefs: NudgePreferences): NudgeState {
  return {
    workedMs: 0,
    breakThresholdMs: prefs.breakMinutes * 60_000,
    lastTickAt: now,
    lastWorkingAt: now,
    lastScreenChangeAt: now,
    lastDiffEvaluatedAt: null,
    idleFired: false,
    snoozeUntil: 0,
  }
}

export function evaluateNudgeTick(prev: NudgeState, input: NudgeInput): NudgeResult {
  const { now, prefs, captureIntervalSec, inCooldown, sourcePaused } = input
  const idleMs = prefs.idleMinutes * 60_000
  const state: NudgeState = { ...prev }
  let fireBreak: NudgeResult["fireBreak"] = null
  let fireIdle: NudgeResult["fireIdle"] = null
  let clearBreakBanner = false

  // 差分評価が直近2周期以内に行われていれば、解析ループは画面を実際に見ている
  const loopEvaluating =
    state.lastDiffEvaluatedAt != null && now - state.lastDiffEvaluatedAt <= captureIntervalSec * 1000 * 2 + 10_000
  const screenRecentlyChanged = state.lastScreenChangeAt != null && now - state.lastScreenChangeAt < idleMs

  // 「作業中」の判定:
  //  - 映像が止まっている間は作業していない
  //  - 画面が idleMinutes 以上変化していなければ作業していない
  //  - クールダウン中や評価未到達の間は画面を判断できないので、保守的に作業中とみなす
  const working = !sourcePaused && (inCooldown || !loopEvaluating || screenRecentlyChanged)

  const dt = state.lastTickAt != null ? Math.max(0, now - state.lastTickAt) : 0
  state.lastTickAt = now
  if (working) {
    state.workedMs += dt
    state.lastWorkingAt = now
  } else if (state.workedMs > 0 && state.lastWorkingAt != null && now - state.lastWorkingAt >= idleMs) {
    // 休憩・離席が idleMinutes 以上続いた: 連続作業はここで途切れたとみなす
    state.workedMs = 0
    state.breakThresholdMs = prefs.breakMinutes * 60_000
    clearBreakBanner = true
  }

  // 休憩リマインド: 実作業の積算が閾値を超えるたびに提案
  if (prefs.breakEnabled && state.workedMs >= state.breakThresholdMs && now >= state.snoozeUntil) {
    fireBreak = { minutes: Math.round(state.workedMs / 60_000) }
    state.breakThresholdMs = state.workedMs + prefs.breakMinutes * 60_000
  }

  // 無操作リマインド: 解析ループが実際に画面を評価しており、その結果として
  // 閾値以上変化していない場合に1エピソード1回だけ。
  // クールダウン中・映像停止中・評価未到達では「動いていない」と断定できないので出さない
  if (
    prefs.idleEnabled &&
    !state.idleFired &&
    loopEvaluating &&
    !inCooldown &&
    !sourcePaused &&
    state.lastScreenChangeAt != null &&
    now - state.lastScreenChangeAt >= idleMs &&
    now >= state.snoozeUntil
  ) {
    state.idleFired = true
    fireIdle = { minutes: Math.round((now - state.lastScreenChangeAt) / 60_000) }
  }

  return { state, fireBreak, fireIdle, clearBreakBanner }
}

/** スヌーズ: 15分後に再提案し、その間は無操作リマインドも抑制する */
export function snoozeBreak(prev: NudgeState, now: number, snoozeMinutes = 15): NudgeState {
  return {
    ...prev,
    snoozeUntil: now + snoozeMinutes * 60_000,
    breakThresholdMs: prev.workedMs + snoozeMinutes * 60_000,
  }
}
