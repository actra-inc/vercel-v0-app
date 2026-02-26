-- work_logsテーブルにレポート関連のカラムを追加

-- report_typeカラムを追加（レポートの種類を識別）
ALTER TABLE work_logs
ADD COLUMN IF NOT EXISTS report_type TEXT;

-- report_dataカラムを追加（レポートの詳細データをJSONBで保存）
ALTER TABLE work_logs
ADD COLUMN IF NOT EXISTS report_data JSONB;

-- インデックスを追加（レポートの検索を高速化）
CREATE INDEX IF NOT EXISTS idx_work_logs_report_type ON work_logs(report_type);

-- コメントを追加
COMMENT ON COLUMN work_logs.report_type IS 'レポートの種類（例：summary）';
COMMENT ON COLUMN work_logs.report_data IS 'レポートの詳細データ（JSONB形式）';
