# 🔐 環境変数設定ガイド

## 📋 必要な環境変数

### Supabase関連
\`\`\`bash
# Supabase Dashboard → Settings → API から取得
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

### 認証関連
\`\`\`bash
# 本番URL
NEXTAUTH_URL=https://your-app.vercel.app
# ランダムな文字列（32文字以上推奨）
NEXTAUTH_SECRET=your-super-secret-key-here-32-chars-min
\`\`\`

### API関連（オプション）
\`\`\`bash
# Google AI Studio から取得
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Toggl Track から取得
TOGGL_API_TOKEN=your-toggl-api-token
TOGGL_WORKSPACE_ID=1234567
\`\`\`

## 🔧 Vercelでの設定方法

1. Vercel Dashboard → プロジェクト選択
2. Settings → Environment Variables
3. 上記の環境変数を一つずつ追加
4. Production, Preview, Development すべてにチェック
5. 「Save」をクリック

## 🚨 セキュリティ注意事項

- `NEXT_PUBLIC_` プレフィックスは公開される
- Service Role Keyは絶対に公開しない
- 本番環境では強力なNEXTAUTH_SECRETを使用
- 定期的にAPIキーをローテーション
