# 🔧 デプロイメント トラブルシューティング

## よくある問題と解決方法

### 1. 環境変数の問題

#### NEXTAUTH_URL が設定されていない
\`\`\`bash
# Vercel Dashboard で設定
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-random-secret-32-chars-long
\`\`\`

#### Supabase環境変数の問題
\`\`\`bash
# 正しい形式で設定されているか確認
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

### 2. Supabaseの設定問題

#### テーブルが存在しない
- SQL Editor で `scripts/fix-existing-policies.sql` を実行
- 全テーブルとRLSポリシーが作成される

#### 認証設定の問題
\`\`\`
Site URL: https://your-app.vercel.app
Redirect URLs: https://your-app.vercel.app/auth/callback
\`\`\`

### 3. 認証の問題

#### 無限ループ
- ブラウザのローカルストレージをクリア
- `/debug` ページで「ストレージクリア」を実行

#### Google認証エラー
- Supabaseの認証設定でGoogle Providerが有効か確認
- リダイレクトURLが正しく設定されているか確認

### 4. デプロイメントの問題

#### ビルドエラー
\`\`\`bash
# 型エラーの場合
npm run type-check

# 依存関係の問題
npm install
\`\`\`

#### 実行時エラー
- Vercel Function Logs を確認
- ブラウザのコンソールでエラー詳細を確認

## デバッグ手順

1. **デバッグページにアクセス**
   \`\`\`
   https://your-app.vercel.app/debug
   \`\`\`

2. **環境変数の確認**
   - 全ての必要な環境変数が設定されているか
   - 値が正しい形式か

3. **Supabase接続テスト**
   - 接続が成功するか
   - 全テーブルが存在するか

4. **認証テスト**
   - ログイン/ログアウトが正常に動作するか
   - セッションが正しく管理されているか

## 修正後の確認事項

- [ ] デバッグページで全項目が緑色
- [ ] Google認証が正常に動作
- [ ] 設定画面にアクセス可能
- [ ] データの保存/読み込みが正常
- [ ] 画面キャプチャ機能が動作（権限許可後）

## サポート

問題が解決しない場合は、以下の情報を含めてお知らせください：

1. デバッグページのスクリーンショット
2. ブラウザコンソールのエラーメッセージ
3. Vercel Function Logsのエラー（あれば）
4. 実行した手順の詳細
