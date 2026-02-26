# 🚀 デプロイメントガイド

## 📋 デプロイ前チェックリスト

### ✅ 必要な準備
- [ ] Supabaseプロジェクトが作成済み
- [ ] Google OAuth設定が完了
- [ ] ストレージバケット「screenshots」が作成済み
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
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-random-secret
\`\`\`

### オプション環境変数
\`\`\`
GEMINI_API_KEY=your-gemini-api-key
TOGGL_API_TOKEN=your-toggl-token
TOGGL_WORKSPACE_ID=your-workspace-id
\`\`\`

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
