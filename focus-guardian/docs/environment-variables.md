# 🔐 環境変数設定ガイド

コードが実際に参照する環境変数の一覧です（2026-09-08 更新）。
Vercel Dashboard → Settings → Environment Variables で設定します。

## 必須（アプリの基本動作）

```bash
# Supabase Dashboard → Settings → API から取得
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Gemini / Toggl の API キーはユーザーごとにアプリの設定画面から登録し、
Supabase の `user_settings` に保存されます（環境変数では設定しません）。

## 週次レポート配信（設定 > その他 > 週次レポート配信 を使う場合）

```bash
# Supabase Dashboard → Settings → API の service_role キー。
# /api/weekly-report/cron だけが使用する（他のルートでは使わない）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Vercel Cron が付ける Bearer トークンの照合用。ランダムな長い文字列
CRON_SECRET=（32文字以上のランダム文字列）

# メール配信（Resend）。未設定だとメール配信はスキップされ、Slack のみ送れる
RESEND_API_KEY=re_xxxxxxxxxxxx

# 任意: 送信元。未設定なら "FlowNudge <onboarding@resend.dev>"（Resend の検証用ドメイン）
WEEKLY_REPORT_FROM=FlowNudge <report@your-domain.example>
```

- 配信スケジュールは `vercel.json` の `crons`（毎週月曜 0:00 UTC）で定義しています。
- Slack 配信を使う場合の Incoming Webhook URL は環境変数ではなく、各ユーザーがアプリの設定画面で登録します。

## 任意（Toggl の環境変数フォールバック）

DB に Toggl 資格情報が無いときだけ、**所有者として指定した1ユーザーに限って**環境変数を使います。
`TOGGL_OWNER_USER_ID` または `TOGGL_OWNER_EMAIL` のどちらかを設定しないとフォールバックは無効です。

```bash
TOGGL_API_TOKEN=your-toggl-api-token
TOGGL_WORKSPACE_ID=1234567
# どちらか一方でよい
TOGGL_OWNER_USER_ID=（Supabase auth のユーザーUUID）
TOGGL_OWNER_EMAIL=owner@example.com
```

## 自動で設定されるもの（設定不要）

`VERCEL_ENV` / `VERCEL_URL` / `VERCEL_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_REF` は Vercel が付与します。
`NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_BUILD_*` は `next.config.mjs` がビルド時に生成します。

## 使っていないもの

`NEXTAUTH_URL` / `NEXTAUTH_SECRET` は本アプリでは使用していません（認証は Supabase Auth）。
`/debug` ページの表示項目に名前が残っているだけなので、設定は不要です。

## 🔧 Vercelでの設定方法

1. Vercel Dashboard → プロジェクト選択
2. Settings → Environment Variables
3. 上記の環境変数を一つずつ追加
4. Production, Preview, Development のうち必要な環境にチェック
5. 「Save」をクリックし、再デプロイする（環境変数はビルド時に取り込まれる）

## 🚨 セキュリティ注意事項

- `NEXT_PUBLIC_` プレフィックスの値はブラウザに公開される（anon キー以外を付けない）
- `SUPABASE_SERVICE_ROLE_KEY` は RLS を無視できるため絶対に公開しない（`lib/supabase-admin.ts` は `server-only`）
- `CRON_SECRET` が未設定だと cron エンドポイントは常に 401 を返す（安全側）
- 定期的にAPIキーをローテーションする
