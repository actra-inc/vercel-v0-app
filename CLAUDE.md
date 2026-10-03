# CLAUDE.md — FlowNudge ローカル動作版（`local` ブランチ）

このリポジトリで作業する人（チームメイト・AI エージェント）が最初に読む前提。
内容は `focus-guardian/docs/local-ai.md`・git log・コードから確認できる事実に限る。詳しい設計は `focus-guardian/docs/local-ai.md` を参照。

## プロダクト概要

- アプリ本体は `focus-guardian/`（Next.js 15 / React 19 / Supabase / Vercel）。
- `local` ブランチは、画面解析・まとめレポート・日報の推論を **Chrome 内蔵の Gemini Nano（Prompt API）でブラウザ内だけで行う版**。
  `sub` から分岐（分岐点 `5b6c9b4`）し、`856f129` で外部 LLM 送信と API キーを撤去した。`sub` の更新は `git merge origin/sub` で取り込む（直近の取り込みは `385d885`、`d05fa8e` まで）。
- **最重要の不変条件：画像・画面内容を端末の外に出さない。** スクリーンショットも、画面から読み取った文字も、解析プロンプトも、サーバー・外部サービスへ送らない。
  端末外（Supabase）に保存するのは解析結果のテキスト（activity / category / work_category / details / applications / focus_score）と、予定作業名・ユーザー設定など。
- Supabase は旧版（クラウド版）と**共用**。`user_settings.gemini_api_key` / `gemini_model` 列は旧版が使うため残置しているが、このブランチのコードは読み書きしない。

## 主要ファイルの役割（`focus-guardian/` 配下）

| ファイル | 役割 |
|---|---|
| `lib/local-ai.ts` | Prompt API の薄いラッパー。利用可否の判定と購読、モデルのダウンロード、推論の直列化（同時に 1 件）、JSON 抽出。`runLocalPrompt` の `timeoutMs` は**実行開始時点から**数える（順番待ちは含めない）。失敗時（中断以外）はベースセッションを作り直し、JSON Schema 無しで 1 回だけ再試行する |
| `types/prompt-api.d.ts` | Prompt API（グローバル `LanguageModel`）の最小型定義 |
| `hooks/use-local-ai.ts` | `lib/local-ai.ts` の状態を React から購読 |
| `lib/analysis-prompt.ts` | 画面解析のプロンプト・JSON Schema・応答の正規化（純関数）。予定作業が空なら「未設定」と書く。作業種類は一覧の表記のまま（翻訳しない）返させる |
| `lib/report-builders.ts` | まとめレポート／日報のプロンプト・スキーマ・AI 不使用時のフォールバック・正規化・日報 Markdown（純関数・日英対応） |
| `lib/local-reports.ts` | まとめレポート／日報を端末内 AI で生成。失敗時はログからの機械的レポート |
| `components/work-log-panel.tsx` | キャプチャ → 差分スキップ（2%）→ 縮小（768px、2 画面合成時 1536px）→ 端末内推論 → 正規化 → `work_logs` へ保存。判定呼び出しには JSON Schema を付けない |
| `components/local-ai-settings.tsx` | 設定タブ「端末内 AI」：利用可否・動作要件・モデルダウンロード |
| `app/local-ai-check/page.tsx` | ログイン不要の動作確認ページ。DB に保存しない。機種チェックと 1 枚解析（所要時間・判定・生出力） |
| `app/privacy/page.tsx`・`app/privacy/en/page.tsx` | プライバシーポリシー（日・英） |
| `app/terms/page.tsx`・`app/terms/en/page.tsx` | 利用規約（日・英） |
| `lib/weekly-report.ts`・`app/api/weekly-report/{cron,test}/route.ts` | 週次レポート配信（Resend メール / Slack Webhook）。AI コメントは廃止（`aiComment` は常に `null`）。本文には集計値に加え、脱線先の活動名上位 3 件（`lib/log-stats.ts` の `topDistractions`）が載る |
| `lib/translations/ja.ts`・`en.ts` | UI 文言。`en.ts` は `Record<TranslationKey, string>` で型拘束されており、片方だけの追加・削除はビルドエラー |

削除済み（復活させない）：`app/api/analyze-screenshot/`、`app/api/generate-daily-report/`、`app/api/generate-summary-report/`、`components/gemini-api-settings.tsx`、`scripts/create-storage-bucket.sql`。

## セットアップ

pnpm はインストールされていない。依存は `focus-guardian/` で次のコマンドで入れる（ロックファイルは変更しない）。

```bash
npx -y pnpm@9 install --frozen-lockfile
```

- `node_modules/.bin/*` はシェルスクリプトなので、`node node_modules/.bin/tsc` ではなく `./node_modules/.bin/tsc` のように直接実行する。
- `package.json` / `pnpm-lock.yaml` は変更しない。

開発サーバー（ログイン不要の確認なら Supabase はダミー値でよい）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder ./node_modules/.bin/next dev -p 3000
```

## 検証コマンド（`focus-guardian/` で実行。変更後は全部通すこと）

1. 型チェック

   ```bash
   ./node_modules/.bin/tsc --noEmit -p tsconfig.json
   ```

   既知のエラーは **27 件で、すべてデバッグ系ファイル**（`app/debug/page.tsx` 24 件、`app/api/debug/supabase-test/route.ts` 1 件、`hooks/use-screen-capture.ts` 1 件、`lib/debug-utils.ts` 1 件）。
   **これ以外のファイルでエラーが出たら失敗。** `next.config.mjs` が `ignoreBuildErrors: true` なので、ビルドが通っても型エラーは見逃される。

2. 本番ビルド

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder ./node_modules/.bin/next build
   ```

   `tsc` と `next build` は `tsconfig.tsbuildinfo` を共有するので並列に走らせない。

3. 秘密情報スキャン（出力が空であること）

   ```bash
   grep -rl "SERVICE_ROLE\|CRON_SECRET" .next/static/
   ```

4. 翻訳キーの件数一致（ja と en が同数であること。現在 612）

   ```bash
   grep -cE "^  [A-Za-z0-9_]+:" lib/translations/ja.ts lib/translations/en.ts
   ```

## 禁止事項

- **`git push` しない。**
- **Supabase へ書き込む操作・マイグレーションをしない**（本番と共用。SQL の実行、テーブル・列の変更、データの書き換えを含む）。
- **削除済みの `analyze-screenshot` と `gemini-api-settings.tsx` を復活させない**（`sub` を取り込むときの衝突でも削除を維持する）。
- **外部 LLM API を呼ぶコードを足さない**（Gemini / Gemma / OpenAI / Anthropic などをサーバー・クライアントのどちらからも呼ばない。推論は `lib/local-ai.ts` 経由の端末内のみ）。
- **プライバシーポリシー・利用規約の記述は実装と一致させる。** 端末外に出るデータ・委託先・保存内容に関わるコードを変えたら、日英の `app/privacy/` と `app/terms/` を同じ変更で直す。

## その他の規約

- UI 文言は `lib/translations/ja.ts` と `en.ts` の両方に追加する（ハードコード禁止）。
- 解析ループ（`components/work-log-panel.tsx`）に `alert()` / `confirm()` を入れない（メインスレッドを止めてキャプチャが止まる）。
- コミットメッセージは日本語で、症状 → 根因 → 修正の順に書く。
