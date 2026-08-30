-- 既存環境向けマイグレーション（2026-08-22 作成 / 2026-08-27 冪等化）
-- コードとDBスキーマの不整合を是正する。何度実行しても安全（冪等）。
--
-- 注意: create-missing-tables.sql / create-work-logs-table.sql（非推奨）で
-- 構築された旧レイアウトの work_logs（ai_analysis / confidence_score 構造）は
-- このスクリプトでは救済できません。supabase-schema-final.sql での再構築が必要です。

-- 1. work_logs にコードが書き込む列を冪等に補完する
--    （work_category: 全ログ保存が PGRST204 で失敗する原因だった。
--      report_type / report_data: レポート保存とログ全クリアに必須だが
--      現行スキーマ4本のどれにも定義が無く add-report-columns.sql のみに存在した）
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS work_category TEXT;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS report_type TEXT;
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS report_data JSONB;
CREATE INDEX IF NOT EXISTS idx_work_logs_report_type ON work_logs(report_type);

-- 2. confidence / focus_score を INTEGER (0-100) に統一。
--    値が1以下の行は旧0.0-1.0スケールとみなして×100で換算する。
--    重要: 列が既に integer の場合は何もしない（ガードなしのALTERは
--    再実行のたびにUSING式を全行へ再適用し、値がちょうど1の行を100に
--    破壊してしまう。また列が存在しない旧レイアウトではエラーで
--    スクリプト全体が中断してしまう）
DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'work_logs'
      AND column_name IN ('confidence', 'focus_score')
      AND data_type <> 'integer'
  LOOP
    EXECUTE format(
      'ALTER TABLE work_logs ALTER COLUMN %I TYPE INTEGER USING (CASE WHEN %I IS NULL THEN NULL WHEN %I <= 1 THEN ROUND(%I * 100) ELSE ROUND(%I) END)::INTEGER',
      col.column_name, col.column_name, col.column_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;

-- 2b. user_settings にコードが読み書きする列を冪等に補完する。
--     本番DBが旧スクリプトで構築されている場合、toggl_api_token 等の列が
--     存在せず、Toggl設定の保存が PGRST204（column not found）で失敗して
--     「保存したのに毎回消える」症状になる（Geminiキーは列があるため保存できる）
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS toggl_api_token TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS toggl_workspace_id TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS gemini_model TEXT DEFAULT 'gemini-3.5-flash-lite';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS capture_interval INTEGER DEFAULT 30;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS auto_sync_toggl BOOLEAN DEFAULT false;

-- 2c. 2026-08-30 追加機能の列（いずれもJSONB・冪等）
--     analysis_rules: 誤判定フィードバックから作る判定ルール（最大20件）
--     nudge_preferences: 休憩・無操作リマインドの設定
--     weekly_report: 週次レポート配信の設定（enabled/channel/slackWebhookUrl/timezone）
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS analysis_rules JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS nudge_preferences JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS weekly_report JSONB;
--     activity_categories: 作業種類カテゴリ（旧localStorage保存から端末間同期へ移行）
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS activity_categories JSONB;

-- 3. user_settings の既定値をコード側と一致させる
ALTER TABLE user_settings ALTER COLUMN gemini_model SET DEFAULT 'gemini-3.5-flash-lite';
ALTER TABLE user_settings ALTER COLUMN capture_interval SET DEFAULT 30;

-- 3b. 旧バグ由来のキャプチャ間隔180秒を既定の30秒へ是正する。
--     180はUIの選択肢（30/60/120/300）に存在しない値であり、
--     旧既定値バグで作成された行にしか現れないため一括更新してよい。
--     60/120/300はユーザーが選択した可能性があるため変更しない
UPDATE user_settings SET capture_interval = 30 WHERE capture_interval = 180;

-- 4. public.users 行の担保。
--    全テーブルが REFERENCES public.users(id) を持つ一方、auth.users から
--    public.users へ行を作る経路がアプリ・DBのどちらにも無く、新規ユーザーの
--    最初の保存がFK違反(23503)で失敗し得た。
--    (a) 既存の auth ユーザーをバックフィルし、(b) 以後の新規サインアップで
--    自動作成するトリガを張る（いずれも冪等）
INSERT INTO public.users (id, email, name, avatar_url)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', au.email),
  au.raw_user_meta_data->>'avatar_url'
FROM auth.users au
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. PostgREST（Supabase API）のスキーマキャッシュを再読み込みする。
--    ALTER TABLE 後もキャッシュが古いままだと、列が実在していてもAPIは
--    PGRST204「Could not find the 'toggl_api_token' column ... in the schema cache」を
--    返し続け、「SQLを流したのに保存できない」状態になる
NOTIFY pgrst, 'reload schema';

-- 確認用(1): 必要な列が揃っているか。
-- toggl_api_token / toggl_workspace_id が並んでいなければ、このSQLが実行された
-- プロジェクトとアプリの接続先プロジェクトが違う（NEXT_PUBLIC_SUPABASE_URL を確認）
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('work_logs', 'user_settings')
  AND column_name IN ('work_category', 'report_type', 'report_data', 'confidence', 'focus_score',
                      'gemini_model', 'capture_interval',
                      'toggl_api_token', 'toggl_workspace_id', 'gemini_api_key', 'auto_sync_toggl',
                      'analysis_rules', 'nudge_preferences', 'weekly_report', 'activity_categories')
ORDER BY table_name, column_name;

-- 確認用(2): user_settings に書き込みできるRLSポリシーがあるか
-- （SELECTだけ許可されていると保存が0行更新で静かに失敗する）
SELECT policyname, cmd, qual IS NOT NULL AS has_using, with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_settings'
ORDER BY policyname;

-- 確認用(3): 各テーブルでRLSが有効か。
-- rowsecurity が false のテーブルがあると、anonキーを持つ誰でも他人の行を
-- 読み書きできる状態になる（このアプリはRLSだけで他人のデータを守っている）
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')
ORDER BY tablename;
