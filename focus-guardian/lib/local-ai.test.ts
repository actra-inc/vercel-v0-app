// H-2 の再現テスト（回帰防止用）。
//
// 症状: `promptOnce` が `getBaseSession` / `lm.create` に `signal` を渡していないと、
// `AbortSignal.timeout(timeoutMs)` がモデルのダウンロード待ちを打ち切れない。
// 推論は `enqueue` により同時1件に直列化されているため、1件目がダウンロード待ちで
// 無期限にブロックされると、後続の全呼び出し（レポート生成・画面解析）が
// 永久に順番待ちのまま進まなくなる。
//
// このテストは `LanguageModel.create()` が「ダウンロード中で止まったまま」
// （渡された signal が無ければ絶対に解決しない Promise）を返す偽のグローバルを立て、
// (1) `timeoutMs` で実際に打ち切られること、(2) 打ち切り後も内部状態（`creating` 等）が
// 壊れたまま残らず、次の呼び出しが正常に完了できることを確認する。
//
// 修正前のコード（signal 未伝播）でこのテストを実行すると、1回目の
// `runLocalPrompt` が永久に解決しないため、テストの timeout オプションで
// タイムアウト失敗する（プロセスがハングしたままにはならない）。
//
// 実行方法:
//   node --experimental-strip-types --test lib/local-ai.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"

// lib/local-ai.ts は読み込み時にグローバルを参照しないため import 自体は通る。
// ただし `window` / `LanguageModel` が無いと `api()` が常に null を返すので、
// Node 環境ではテスト用に両方ともここで用意する
;(globalThis as any).window = globalThis

function makeFakeSession(promptImpl: () => Promise<string>) {
  return {
    async clone(_opts?: { signal?: AbortSignal }) {
      return {
        async prompt(_messages: unknown, _options: unknown) {
          return promptImpl()
        },
        destroy() {
          /* no-op */
        },
      }
    },
    destroy() {
      /* no-op */
    },
  }
}

test(
  "runLocalPrompt: timeoutMsでダウンロード待ちを打ち切り、後続の呼び出しが無限に待たされない",
  { timeout: 5_000 },
  async () => {
    let createCalls = 0

    ;(globalThis as any).LanguageModel = {
      async availability() {
        return "downloadable"
      },
      create(opts?: { signal?: AbortSignal }) {
        createCalls++
        if (createCalls === 1) {
          // モデルのダウンロードが止まったままの状態を模す。
          // signal が渡されていれば中断で reject、渡されていなければ
          // （=修正前の挙動）絶対に解決しない Promise のまま
          return new Promise((_resolve, reject) => {
            const signal = opts?.signal
            if (!signal) return
            if (signal.aborted) {
              reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
              return
            }
            signal.addEventListener("abort", () => {
              reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
            })
          })
        }
        // 2回目以降（打ち切り後の再試行）は即座に使えるセッションを返す
        return Promise.resolve(makeFakeSession(async () => '{"ok":true}'))
      },
      async params() {
        return null
      },
    }

    const { runLocalPrompt } = await import("./local-ai.ts")

    const start = Date.now()
    await assert.rejects(() => runLocalPrompt({ lang: "ja", text: "hi", timeoutMs: 50 }))
    const elapsed = Date.now() - start
    assert.ok(elapsed < 2_000, `timeoutMs (50ms) で打ち切られるはずが ${elapsed}ms かかった`)

    // 1件目の打ち切り後、内部状態（creating 等）が壊れたまま残っていないこと。
    // 残っていれば次の呼び出しがここでハングし、このテスト自体が timeout で失敗する
    const text = await runLocalPrompt({ lang: "ja", text: "hi again", timeoutMs: 2_000 })
    assert.equal(text, '{"ok":true}')
    assert.equal(createCalls, 2, "打ち切り後は新しい lm.create() で再試行しているはず")
  },
)
