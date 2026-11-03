// 画面共有の見張り（純関数）。共有が「切れた」とブラウザが知らせてくれない止まり方を拾う。
// - スリープ明け: 見張りの時計が大きく飛んだら、すぐ共有の状態を確かめる
// - 記録が止まった: 解析中なのに一定時間フレームを取れていなければ、1 回だけ知らせる
// （2026-11-04: スリープの後などに共有が止まっても気づけない、という要望への対応）

export interface WatchdogState {
  /** 見張りが最後に動いた時刻（ms） */
  lastTickAt: number
  /** 最後にフレームを取れた時刻（ms）。開始時は開始時刻 */
  lastFrameAt: number
  /** 今回の停滞をすでに知らせたか（フレームが取れたら戻す） */
  stalledNotified: boolean
}

/** 見張りの周期 */
export const WATCHDOG_TICK_MS = 15_000

export function initialWatchdogState(now: number): WatchdogState {
  return { lastTickAt: now, lastFrameAt: now, stalledNotified: false }
}

/** フレームを取れたときに呼ぶ */
export function recordFrame(state: WatchdogState, now: number): WatchdogState {
  return { ...state, lastFrameAt: now, stalledNotified: false }
}

/** 停滞とみなすまでの時間。キャプチャ間隔の 3 回分（ただし最低 90 秒） */
export function stallThresholdMs(captureIntervalMs: number): number {
  return Math.max(3 * captureIntervalMs, 90_000)
}

export function evaluateWatchdog(
  state: WatchdogState,
  now: number,
  captureIntervalMs: number,
  tickMs: number = WATCHDOG_TICK_MS,
): { wokeFromSleep: boolean; stalled: boolean; next: WatchdogState } {
  // スリープ中はタイマーが止まるので、復帰した直後の 1 回だけ間が大きく空く
  const wokeFromSleep = now - state.lastTickAt > Math.max(60_000, 3 * tickMs)
  const stalled = !state.stalledNotified && now - state.lastFrameAt > stallThresholdMs(captureIntervalMs)
  return {
    wokeFromSleep,
    stalled,
    next: { ...state, lastTickAt: now, stalledNotified: state.stalledNotified || stalled },
  }
}
