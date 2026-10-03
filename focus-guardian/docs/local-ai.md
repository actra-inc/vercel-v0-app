# 端末内 AI（ローカル動作版）の設計メモ

2026-09-15 に `sub` ブランチから分岐した **ローカル動作版**（ブランチ `local`）の説明。
画面解析・まとめレポート・日報の推論をすべて **Chrome 組み込みの Prompt API（Gemini Nano）** で行い、
スクリーンショットや画面由来のテキストを端末の外へ出さない。

## 何が変わったか（`sub@5b6c9b4` 比）

| 項目 | 旧（クラウド版） | ローカル動作版 |
|---|---|---|
| 画面解析 | 縮小 JPEG を `/api/analyze-screenshot` 経由でユーザーの Gemini API キーで Google へ送信 | `lib/local-ai.ts` → `LanguageModel.prompt([image, text])` をブラウザ内で実行 |
| まとめレポート・日報 | `/api/generate-*-report` で Gemma（無料枠）へ | `lib/local-reports.ts` で端末内生成。失敗時はログからの機械的レポート |
| 週次レポートの AI コメント | cron が `user_settings.gemini_api_key` で Gemma を呼ぶ | 廃止（`aiComment` は常に `null`。本文の内容は下の「端末外に出るデータ」を参照） |
| API キー | 設定画面で入力し `user_settings.gemini_api_key` に保存 | 不要。UI・型・SELECT から撤去（DB 列は旧版との共用のため残置） |
| モデル選択 | `gemini_model` を設定画面で選択 | 不要 |
| 設定タブ | 「Gemini API」 | 「端末内 AI」（`components/local-ai-settings.tsx`）: 利用可否・要件・モデルダウンロード |

削除したファイル: `app/api/analyze-screenshot/`, `app/api/generate-daily-report/`, `app/api/generate-summary-report/`,
`components/gemini-api-settings.tsx`, `scripts/create-storage-bucket.sql`。

## 端末外に出るデータ（プライバシーポリシーの根拠）

- 出ない: 画面の画像、画面上の文字・内容、解析プロンプト
- 出る（Supabase・本人のみアクセス可）: 解析結果のテキスト（activity / category / work_category / details 40字 / applications / focus_score）、
  予定作業名、ユーザー設定、Toggl 資格情報
- 週次配信（任意。利用者が設定でオンにした場合のみ）: 合計作業時間・平均集中度・生産的ログの割合・脱線回数・主な脱線先の活動名（上位 3 件。`lib/log-stats.ts` の `topDistractions`）・作業種類ごとの時間を、登録メールアドレス宛（Resend 経由）または利用者が登録した Slack Incoming Webhook へ送る。画像や作業ログの要約文（details）は載せない

## 動作要件（Chrome の仕様。`developer.chrome.com/docs/ai/prompt-api`）

- デスクトップ版 Chrome 138 以降（Windows 10/11・macOS 13+・Linux・Chromebook Plus）
- Chrome プロファイルのあるドライブに 22 GB 以上の空き
- GPU VRAM 4 GB 超、または RAM 16 GB 以上＋CPU 4 コア以上
- 初回のみモデルのダウンロード（従量制でない回線）

非対応環境では「解析開始」が無効になり、設定 > 端末内 AI に理由と要件を表示する。

## 主要モジュール

- `types/prompt-api.d.ts` — Prompt API の最小型定義（グローバル `LanguageModel`）
- `lib/local-ai.ts` — 利用可否の購読、ダウンロード、推論の直列化（同時に 1 推論）、JSON 抽出
- `hooks/use-local-ai.ts` — React から状態を購読
- `lib/analysis-prompt.ts` — 解析プロンプト・JSON Schema・応答の正規化（旧サーバールートの純関数化）
- `lib/report-builders.ts` — レポート/日報のプロンプト・スキーマ・フォールバック・正規化
- `lib/local-reports.ts` — レポート/日報の端末内生成

## 既知の制約・今後

- Gemini Nano は小型モデルのため、Gemini 3.5 Flash-Lite より判定が粗い可能性がある。ドッグフーディングで旧ログと突き合わせる
- 推論はページのメインスレッド外（ブラウザ側）で走るが、1 回あたり数秒かかる。差分スキップ（2%）と再入ガードは旧版のまま
- `distraction_check` は旧版同様 DB に保存されない（`lib/supabase.ts` の insert で除外）。PMF 指標に必要なら列追加が要る
- `tesseract.js` は未使用のまま package.json に残る（pnpm 不在のためロックファイルを更新できない）

## 動かし方

### A. 端末内 AI だけ試す（ログイン不要・5 分）

1. 依存を入れる（初回のみ。ロックファイルは変更しない）

   ```bash
   npx -y pnpm@9 install --frozen-lockfile
   ```

2. 開発サーバーを起動（Supabase はダミー値でよい）

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder ./node_modules/.bin/next dev -p 3000
   ```

3. Chrome で `http://localhost:3000/local-ai-check` を開く
4. 「モデルをダウンロード」→ 完了後「画面を1回キャプチャして解析」。所要時間・判定・モデルの生出力が出る

`/local-ai-check` は DB に何も保存せず秘密情報も表示しないため、本番・プレビューでも公開してよい（テスターの機種確認に使える）。

### B. アプリ本体を動かす（ログインあり）

1. `focus-guardian/.env.local` を作る（`.gitignore` 済み）。値は Vercel のプロジェクト設定 > Environment Variables と同じもの

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```

2. Supabase ダッシュボード > Authentication > URL Configuration の Redirect URLs に
   `http://localhost:3000/**` が入っていることを確認（無いとログイン後に本番 URL へ飛ばされる）
3. `./node_modules/.bin/next dev -p 3000` → `http://localhost:3000` で Google ログイン
4. 設定 > 端末内 AI が「利用できます」になっていれば、作業ログタブの「解析開始」が押せる

### C. Vercel プレビュー

`local` ブランチを origin に push すると、Vercel が `sub` と同様にプレビューを自動ビルドする。
ログインまで通すには、プレビュー URL を Supabase の Redirect URLs に追加する必要がある。

## 旧版（sub）との関係

- `sub` の更新は `git merge origin/sub` で取り込む。衝突しやすいのは翻訳ファイル・プライバシーポリシー・
  削除済みの `analyze-screenshot` / `gemini-api-settings.tsx`（ローカル版では削除を維持する）
- Supabase は共用。`user_settings.gemini_api_key` / `gemini_model` 列は旧版が使うため残置
