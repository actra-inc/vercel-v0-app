// M-2 のテスト（回帰防止用）。
//
// 症状: `createWorkLog` / `updateWorkLog` の画像URLガードが「`blob:` で始まるものだけ
// 落とす拒否リスト」だったため、`data:image/...`（画像バイト列そのもの）や任意の
// `https://...` が `work_logs.screenshot_url` / `report_data.source_screenshots` に
// 素通りし得た。「画像・画面内容を端末の外に出さない」はこのブランチの最重要の
// 不変条件（CLAUDE.md）で、Supabase は旧クラウド版と共用のため見逃せない。
//
// 修正後は許可リスト方式（＝ screenshot_url と report_data.source_screenshots は
// insert/update のたびに常に落とす）になっている。このテストは実際の Supabase
// クライアントの `.from()` をスタブに差し替え、ネットワーク送信・DB書き込みを
// 一切行わずに「insert/update へ渡るオブジェクトに画像URLが残っていないこと」だけを
// 純粋関数的に検証する（CLAUDE.md: Supabase への書き込み禁止）。
//
// 実行方法:
//   node --experimental-strip-types --test lib/supabase.test.ts

import { test } from "node:test"
import assert from "node:assert/strict"

// lib/supabase.ts はモジュール読み込み時に createBrowserClient() を呼ぶため、
// 実URLが無いと例外になる。実際の通信は発生しない（クライアント生成のみ）プレースホルダ値を与える
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder"

// tsc の target(ES6)ではトップレベル await が使えないため、Promise のまま保持し
// 各テストの先頭で await する（node --experimental-strip-types での実行には影響しない）
const modulePromise = import("./supabase.ts")

const now = new Date().toISOString()

function makeInsertStub(resultRow: Record<string, unknown>) {
  let captured: any = null
  const builder = {
    insert(obj: any) {
      captured = obj
      return {
        select() {
          return {
            single() {
              return Promise.resolve({ data: resultRow, error: null })
            },
          }
        },
      }
    },
  }
  return { builder, getCaptured: () => captured }
}

function makeUpdateStub(resultRows: Record<string, unknown>[]) {
  let captured: any = null
  const builder = {
    update(obj: any) {
      captured = obj
      const chain = {
        eq() {
          return chain
        },
        select() {
          return Promise.resolve({ data: resultRows, error: null })
        },
      }
      return chain
    },
  }
  return { builder, getCaptured: () => captured }
}

const DANGEROUS_SCREENSHOT_URLS = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
  "https://example.com/some-screenshot.png",
  "blob:https://app.example.com/1234-5678",
]

for (const url of DANGEROUS_SCREENSHOT_URLS) {
  test(`createWorkLog: screenshot_url (${url.slice(0, 12)}...) がinsert対象から常に落ちる`, async () => {
    const { supabase, createWorkLog } = await modulePromise
    const { builder, getCaptured } = makeInsertStub({
      id: "1",
      timestamp: now,
      created_at: now,
    })
    ;(supabase as any).from = () => builder

    await createWorkLog({
      user_id: "u1",
      timestamp: now,
      activity: "test",
      category: "neutral",
      details: "",
      screenshot_url: url,
      applications: [],
      report_data: {
        summary: "",
        productivity_analysis: "",
        focus_trend: "",
        distraction_summary: "",
        time_distribution: { productive_time: 0, distracted_time: 0, neutral_time: 0 },
        key_findings: [],
        recommendations: [],
        overall_score: 0,
        source_screenshots: [url],
      },
    } as any)

    const inserted = getCaptured()
    assert.ok(inserted, "insert が呼ばれていない")
    assert.equal("screenshot_url" in inserted, false, "screenshot_url がinsert対象に残っている")
    assert.deepEqual(
      inserted.report_data?.source_screenshots,
      undefined,
      "report_data.source_screenshots がinsert対象に残っている",
    )
  })
}

test("createWorkLog: 画像URLに関係ない他のフィールドは保持される", async () => {
  const { supabase, createWorkLog } = await modulePromise
  const { builder, getCaptured } = makeInsertStub({ id: "1", timestamp: now, created_at: now })
  ;(supabase as any).from = () => builder

  await createWorkLog({
    user_id: "u1",
    timestamp: now,
    activity: "coding",
    category: "productive",
    details: "working",
    applications: ["VS Code"],
    focus_score: 80,
  } as any)

  const inserted = getCaptured()
  assert.equal(inserted.activity, "coding")
  assert.equal(inserted.category, "productive")
  assert.equal(inserted.focus_score, 80)
  assert.deepEqual(inserted.applications, ["VS Code"])
})

test("createWorkLog: distraction_check は従来どおりinsert対象から落ちる", async () => {
  const { supabase, createWorkLog } = await modulePromise
  const { builder, getCaptured } = makeInsertStub({ id: "1", timestamp: now, created_at: now })
  ;(supabase as any).from = () => builder

  await createWorkLog({
    user_id: "u1",
    timestamp: now,
    activity: "coding",
    category: "productive",
    details: "",
    applications: [],
    distraction_check: { is_distracted: false, reason: "", planned_task: "", severity: "low" },
  } as any)

  const inserted = getCaptured()
  assert.equal("distraction_check" in inserted, false)
})

for (const url of DANGEROUS_SCREENSHOT_URLS) {
  test(`updateWorkLog: screenshot_url (${url.slice(0, 12)}...) がupdate対象から常に落ちる`, async () => {
    const { supabase, updateWorkLog } = await modulePromise
    const { builder, getCaptured } = makeUpdateStub([{ id: "1", timestamp: now, created_at: now }])
    ;(supabase as any).from = () => builder

    await updateWorkLog("1", "u1", {
      screenshot_url: url,
      report_data: {
        summary: "",
        productivity_analysis: "",
        focus_trend: "",
        distraction_summary: "",
        time_distribution: { productive_time: 0, distracted_time: 0, neutral_time: 0 },
        key_findings: [],
        recommendations: [],
        overall_score: 0,
        source_screenshots: [url],
      },
    } as any)

    const updated = getCaptured()
    assert.ok(updated, "update が呼ばれていない")
    assert.equal("screenshot_url" in updated, false, "screenshot_url がupdate対象に残っている")
    assert.deepEqual(
      updated.report_data?.source_screenshots,
      undefined,
      "report_data.source_screenshots がupdate対象に残っている",
    )
  })
}

test("updateWorkLog: 画像URLに関係ない他のフィールドは保持される", async () => {
  const { supabase, updateWorkLog } = await modulePromise
  const { builder, getCaptured } = makeUpdateStub([{ id: "1", timestamp: now, created_at: now }])
  ;(supabase as any).from = () => builder

  await updateWorkLog("1", "u1", { category: "distracted", activity: "yt" } as any)

  const updated = getCaptured()
  assert.equal(updated.category, "distracted")
  assert.equal(updated.activity, "yt")
})
