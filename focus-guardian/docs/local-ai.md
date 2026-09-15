# 端末内 AI（ローカル動作版）の設計メモ

2026-09-15 に `sub` ブランチから分岐した **ローカル動作版**（ブランチ `local`）の説明。
画面解析・まとめレポート・日報の推論をすべて **Chrome 組み込みの Prompt API（Gemini Nano）** で行い、
スクリーンショットや画面由来のテキストを端末の外へ出さない。

## 何が変わったか（`sub@5b6c9b4` 比）

| 項目 | 旧（クラウド版） | ローカル動作版 |
|---|---|---|
| 画面解析 | 縮小 JPEG を `/api/analyze-screenshot` 経由でユーザーの Gemini API キーで Google へ送信 | `lib/local-ai.ts` → `LanguageModel.prompt([image, text])` をブラウザ内で実行 |
| まとめレポート・日報 | `/api/generate-*-report` で Gemma（無料枠）へ | `lib/local-reports.ts` で端末内生成。失敗時はログからの機械的レポート |
| 週次レポートの AI コメント | cron が `user_settings.gemini_api_key` で Gemma を呼ぶ | 廃止（集計値のみ配信。`aiComment` は常に `null`） |
| API キー | 設定画面で入力し `user_settings.gemini_api_key` に保存 | 不要。UI・型・SELECT から撤去（DB 列は旧版との共用のため残置） |
| モデル選択 | `gemini_model` を設定画面で選択 | 不要 |
| 設定タブ | 「Gemini API」 | 「端末内 AI」（`components/local-ai-settings.tsx`）: 利用可否・要件・モデルダウンロード |

削除したファイル: `app/api/analyze-screenshot/`, `app/api/generate-daily-report/`, `app/api/generate-summary-report/`,
`components/gemini-api-settings.tsx`, `scripts/create-storage-bucket.sql`。

## 端末外に出るデータ（プライバシーポリシーの根拠）

- 出ない: 画面の画像、画面上の文字・内容、解析プロンプト
- 出る（Supabase・本人のみアクセス可）: 解析結果のテキスト（activity / category / work_category / details 40字 / applications / focus_score）、
  予定作業名、ユーザー設定、Toggl 資格情報
- 週次配信（任意）: 集計値のみ（Resend / Slack Webhook 経由）

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
