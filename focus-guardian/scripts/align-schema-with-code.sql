-- 既存環境向けマイグレーション（2026-08-22）
-- コードとDBスキーマの不整合3件を是正する。冪等に実行できる。
--
-- 1. work_category 列がどのスキーマスクリプトにも存在しなかった
--    （コードは毎回 insert しており、列が無い環境では全ログ保存が
--      PGRST204 で失敗する）
-- 2. confidence が DECIMAL(3,2)（上限9.99）で、コードの0-100整数と非互換
--    （numeric field overflow で保存失敗。旧0.0-1.0スケールの既存値は×100で換算）
-- 3. user_settings の既定値がコード側（gemini-3.5-flash-lite / 60秒）と乖離

-- 1. work_category 列の追加
ALTER TABLE work_logs ADD COLUMN IF NOT EXISTS work_category TEXT;

-- 2. confidence / focus_score を INTEGER (0-100) に統一。
--    値が1以下の行は旧0.0-1.0スケールとみなして×100で換算する
ALTER TABLE work_logs
  ALTER COLUMN confidence TYPE INTEGER
  USING (CASE WHEN confidence IS NULL THEN NULL
              WHEN confidence <= 1 THEN ROUND(confidence * 100)
              ELSE ROUND(confidence) END)::INTEGER;

ALTER TABLE work_logs
  ALTER COLUMN focus_score TYPE INTEGER
  USING (CASE WHEN focus_score IS NULL THEN NULL
              WHEN focus_score <= 1 THEN ROUND(focus_score * 100)
              ELSE ROUND(focus_score) END)::INTEGER;

-- 3. user_settings の既定値をコード側と一致させる（既存行は変更しない）
ALTER TABLE user_settings ALTER COLUMN gemini_model SET DEFAULT 'gemini-3.5-flash-lite';
ALTER TABLE user_settings ALTER COLUMN capture_interval SET DEFAULT 60;

-- 確認用
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('work_logs', 'user_settings')
  AND column_name IN ('work_category', 'confidence', 'focus_score', 'gemini_model', 'capture_interval')
ORDER BY table_name, column_name;
