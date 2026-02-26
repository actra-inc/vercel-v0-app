# 🚨 クイック修正ガイド

## 設定画面エラーの修正

### 問題
「Application error: a client-side exception has occurred」が設定画面で発生

### 原因
1. Supabaseテーブルが存在しない
2. RLSポリシーが正しく設定されていない
3. 環境変数が正しく読み込まれていない
4. 認証状態の管理に問題がある

### 解決手順

#### Step 1: デバッグページで問題を特定
\`\`\`
https://your-vercel-url.vercel.app/debug
\`\`\`

#### Step 2: Supabaseテーブルとポリシーを修正
1. Supabase Dashboard → SQL Editor
2. `scripts/fix-existing-policies.sql` を実行
3. 全テーブルとRLSポリシーが作成される

#### Step 3: 環境変数を確認
Vercel Dashboard → Settings → Environment Variables
\`\`\`bash
NEXTAUTH_URL=https://your-actual-vercel-url.vercel.app
NEXTAUTH_SECRET=your-random-secret-32-chars-minimum
NEXT_PUBLIC_SUPABASE_URL=https://obcpnxwrjzfxlvbcwvcx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

#### Step 4: ブラウザキャッシュをクリア
1. デバッグページで「ストレージクリア」をクリック
2. ページをリロード
3. 再ログイン

### 修正されたコンポーネント

1. **AuthProvider**: 認証状態の管理を改善
2. **useSupabaseData**: エラーハンドリングを強化
3. **デバッグページ**: 詳細な問題診断機能を追加

### 確認事項

- [ ] デバッグページで全項目が緑色
- [ ] 設定画面にアクセス可能
- [ ] プロジェクト作成/編集が動作
- [ ] 作業ログが正常に保存
- [ ] Google認証が正常に動作

### トラブルシューティング

#### 設定画面でまだエラーが発生する場合
1. ブラウザのコンソール（F12）でエラー詳細を確認
2. Vercel Function Logsでサーバーエラーを確認
3. Supabase Logsでデータベースエラーを確認

#### 認証ループが発生する場合
1. デバッグページでストレージクリア
2. ブラウザを完全に閉じて再起動
3. 再度ログイン

#### データが保存されない場合
1. Supabase Dashboard → Table Editor でテーブル確認
2. RLSポリシーが正しく設定されているか確認
3. ユーザーIDが正しく設定されているか確認

## サポート

問題が解決しない場合は、以下の情報を含めてお知らせください：

1. デバッグページのスクリーンショット
2. ブラウザコンソールのエラーメッセージ
3. 実行した手順の詳細
4. 発生している具体的な問題
