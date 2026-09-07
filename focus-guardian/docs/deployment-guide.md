# 🚀 デプロイメントガイド

## 📋 デプロイ前チェックリスト

### ✅ 必要な準備
- [ ] Supabaseプロジェクトが作成済み
- [ ] Google OAuth設定が完了
- [ ] `scripts/align-schema-with-code.sql` を Supabase の SQL Editor で実行済み
- [ ] ローカルでの動作確認が完了

## 🔧 Step 1: Vercelデプロイ

### 方法A: GitHub連携（推奨）
1. GitHubにコードをプッシュ
2. [Vercel Dashboard](https://vercel.com) にアクセス
3. 「New Project」→ GitHubリポジトリを選択
4. 「Deploy」をクリック

### 方法B: Vercel CLI
\`\`\`bash
npm i -g vercel
vercel --prod
\`\`\`

## 🔐 Step 2: 環境変数設定

Vercel Dashboard → Settings → Environment Variables で以下を設定：

### 必須環境変数
\`\`\`
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
\`\`\`

### 週次レポート配信を使う場合
\`\`\`
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=your-random-secret-32-chars-minimum
RESEND_API_KEY=re_xxxxxxxx
WEEKLY_REPORT_FROM=FlowNudge <report@your-domain.example>   # 任意
\`\`\`

### オプション（Toggl の環境変数フォールバック。所有者1名のみ）
\`\`\`
TOGGL_API_TOKEN=your-toggl-token
TOGGL_WORKSPACE_ID=your-workspace-id
TOGGL_OWNER_EMAIL=owner@example.com   # または TOGGL_OWNER_USER_ID
\`\`\`

Gemini / Toggl のキーは通常、各ユーザーがアプリの設定画面から登録します。
一覧と説明は `docs/environment-variables.md` を参照してください。

## 🌍 Step 3: Supabase本番設定

### Authentication URLs
Supabase Dashboard → Authentication → URL Configuration:
\`\`\`
Site URL: https://your-app.vercel.app
Redirect URLs: https://your-app.vercel.app/auth/callback
\`\`\`

### CORS設定
Supabase Dashboard → Settings → API:
\`\`\`
Additional CORS origins: https://your-app.vercel.app
\`\`\`

## 🔒 Step 4: セキュリティ設定

### RLS確認
- すべてのテーブルでRow Level Securityが有効
- 適切なポリシーが設定済み

### API Keys
- 本番環境では環境変数を使用
- クライアントサイドにシークレットキーを含めない
