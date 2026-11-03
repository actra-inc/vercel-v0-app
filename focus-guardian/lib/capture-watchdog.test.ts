// lib/capture-watchdog.ts の純関数テスト（node:test）
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  evaluateWatchdog,
  initialWatchdogState,
  recordFrame,
  stallThresholdMs,
  WATCHDOG_TICK_MS,
} from "./capture-watchdog.ts"

const T0 = 1_000_000

test("stallThresholdMs: キャプチャ間隔の 3 回分、ただし最低 90 秒", () => {
  assert.equal(stallThresholdMs(30_000), 90_000)
  assert.equal(stallThresholdMs(10_000), 90_000)
  assert.equal(stallThresholdMs(60_000), 180_000)
})

test("evaluateWatchdog: フレームが取れている間は停滞もスリープ明けも出ない", () => {
  let s = initialWatchdogState(T0)
  for (let i = 1; i <= 20; i++) {
    const now = T0 + i * WATCHDOG_TICK_MS
    s = recordFrame(s, now)
    const r = evaluateWatchdog(s, now, 30_000)
    assert.equal(r.stalled, false)
    assert.equal(r.wokeFromSleep, false)
    s = r.next
  }
})

test("evaluateWatchdog: フレームが閾値を超えて取れなければ 1 回だけ停滞を知らせ、フレームが取れたら次の停滞をまた知らせる", () => {
  let s = initialWatchdogState(T0)
  const results: boolean[] = []
  for (let i = 1; i <= 12; i++) {
    const r = evaluateWatchdog(s, T0 + i * WATCHDOG_TICK_MS, 30_000)
    results.push(r.stalled)
    s = r.next
  }
  // 90 秒を超えた最初の回（105 秒）だけ true
  assert.deepEqual(results.map((x, i) => (x ? i + 1 : 0)).filter(Boolean), [7])
  s = recordFrame(s, T0 + 13 * WATCHDOG_TICK_MS)
  let again = false
  for (let i = 14; i <= 22; i++) {
    const r = evaluateWatchdog(s, T0 + i * WATCHDOG_TICK_MS, 30_000)
    again = again || r.stalled
    s = r.next
  }
  assert.equal(again, true)
})

test("evaluateWatchdog: 見張りの時計が 60 秒以上飛んだらスリープ明けとみなす（その回だけ）", () => {
  let s = initialWatchdogState(T0)
  s = evaluateWatchdog(s, T0 + WATCHDOG_TICK_MS, 30_000).next
  const woke = evaluateWatchdog(s, T0 + WATCHDOG_TICK_MS + 10 * 60_000, 30_000)
  assert.equal(woke.wokeFromSleep, true)
  const after = evaluateWatchdog(woke.next, T0 + WATCHDOG_TICK_MS + 10 * 60_000 + WATCHDOG_TICK_MS, 30_000)
  assert.equal(after.wokeFromSleep, false)
})
