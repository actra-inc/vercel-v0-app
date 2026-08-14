-- レポート/作業ログの削除が「成功と表示されるのに消えない」場合の修正SQL
--
-- 原因: RLS(Row Level Security)が有効なテーブルにDELETEポリシーが無いと、
-- Supabaseはエラーを返さず「0行削除」で成功扱いにするため。
-- このSQLをSupabaseのSQL Editorで実行すると、work_logsのDELETEポリシーを保証できる。
-- （アプリ側は削除件数0を検知してエラー表示するよう修正済み。
--   このSQLはその根本原因を解消するためのもの）

-- 既存の同名ポリシーがあれば作り直す（冪等）
DROP POLICY IF EXISTS "Users can delete own work logs" ON public.work_logs;

CREATE POLICY "Users can delete own work logs" ON public.work_logs
  FOR DELETE USING (auth.uid() = user_id);

-- 確認: work_logs に対する現在のポリシー一覧を表示
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'work_logs'
ORDER BY cmd;
