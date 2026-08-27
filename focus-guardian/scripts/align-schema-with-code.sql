-- user_settings テーブルにコードが必要とする列を追加する（冪等）
-- このSQLをSupabase SQL Editorで実行してください。

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS toggl_api_token TEXT,
  ADD COLUMN IF NOT EXISTS toggl_workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS gemini_model TEXT,
  ADD COLUMN IF NOT EXISTS capture_interval INTEGER,
  ADD COLUMN IF NOT EXISTS auto_sync_toggl BOOLEAN DEFAULT FALSE;

-- 確認
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_settings'
ORDER BY ordinal_position;
