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

// ---- extractJsonObject: 途中で切れた出力を補って読む（2026-10-05 の実画面テストで 33 回中 1 回発生） ----
import { extractJsonObject } from "./local-ai.ts"

test("extractJsonObject: 実際に起きた途切れ（details の文字列の途中で終わる）を補って読める", () => {
  const raw =
    '```json\n{\n  "activity": "YouTube動画の視聴",\n  "category": "distracted",\n  "work_category": "娯楽",\n  "confidence": 0.95,\n  "apps": ["YouTube"],\n  "distraction_check": {\n    "is_distracted": true,\n    "reason": "娯楽系の動画を視聴しているため。",\n    "task_alignment": 0.1\n  },\n  "details": "猫の動画を視聴している。'
  const v = extractJsonObject(raw)
  assert.equal(v.category, "distracted")
  assert.equal(v.distraction_check.is_distracted, true)
  assert.equal(v.work_category, "娯楽")
  assert.equal(v.details, "猫の動画を視聴している。")
})

test("extractJsonObject: キーの途中・コロンの直後で切れても、直前の項目までで読める", () => {
  assert.deepEqual(extractJsonObject('{"a": 1, "b": {"c": true}, "de'), { a: 1, b: { c: true } })
  assert.deepEqual(extractJsonObject('{"a": 1, "b":'), { a: 1 })
  assert.deepEqual(extractJsonObject('{"a": [1, 2'), { a: [1, 2] })
})

test("extractJsonObject: エスケープされた引用符を含む文字列の途中で切れても読める", () => {
  assert.deepEqual(extractJsonObject('{"a": "x\\"y'), { a: 'x"y' })
})

test("extractJsonObject: 完全な JSON・前置き文つき・JSON 無しの既存挙動は変わらない", () => {
  assert.deepEqual(extractJsonObject('はい。{"a":{"b":2}} 以上'), { a: { b: 2 } })
  assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 })
  assert.equal(extractJsonObject("no json here"), null)
  assert.equal(extractJsonObject(""), null)
})

// ---- prewarmLocalAi: 最初の推論だけ遅い問題への対策（2026-10-05） ----

function fakeModel(availability: string, onCreate?: () => void) {
  let createCalls = 0
  ;(globalThis as any).LanguageModel = {
    async availability() {
      return availability
    },
    async create() {
      createCalls++
      onCreate?.()
      return makeFakeSession(async () => '{"ok":true}')
    },
    async params() {
      return null
    },
  }
  return () => createCalls
}

test("prewarmLocalAi: available ならセッションを 1 回だけ作り、直後の runLocalPrompt は create を追加で呼ばない", async () => {
  const { prewarmLocalAi, runLocalPrompt, disposeLocalAi } = await import("./local-ai.ts")
  disposeLocalAi()
  const calls = fakeModel("available")
  assert.equal(await prewarmLocalAi("ja"), true)
  assert.equal(calls(), 1)
  assert.equal(await prewarmLocalAi("ja"), true)
  assert.equal(calls(), 1, "2 回目の prewarm は作り直さない")
  assert.equal(await runLocalPrompt({ lang: "ja", text: "hi", timeoutMs: 2_000 }), '{"ok":true}')
  assert.equal(calls(), 1, "事前作成済みなら推論で create を呼ばない")
})

test("prewarmLocalAi: downloadable / unavailable / 非対応では create を呼ばず false を返す", async () => {
  const { prewarmLocalAi, disposeLocalAi } = await import("./local-ai.ts")
  for (const a of ["downloadable", "unavailable", "downloading"]) {
    disposeLocalAi()
    const calls = fakeModel(a)
    assert.equal(await prewarmLocalAi("ja"), false, a)
    assert.equal(calls(), 0, `${a} のときは create を呼ばない`)
  }
  disposeLocalAi()
  ;(globalThis as any).LanguageModel = undefined
  assert.equal(await prewarmLocalAi("ja"), false)
})

test("prewarmLocalAi: create が失敗しても例外が外に出ず false を返す。その後の推論は自前で作り直せる", async () => {
  const { prewarmLocalAi, runLocalPrompt, disposeLocalAi } = await import("./local-ai.ts")
  disposeLocalAi()
  let fail = true
  const calls = fakeModel("available", () => {
    if (fail) {
      fail = false
      throw new Error("not enough space")
    }
  })
  assert.equal(await prewarmLocalAi("ja"), false)
  assert.equal(calls(), 1)
  assert.equal(await runLocalPrompt({ lang: "ja", text: "hi", timeoutMs: 2_000 }), '{"ok":true}')
})
