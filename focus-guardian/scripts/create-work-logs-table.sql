-- 作業ログを保存するテーブルを作成
CREATE TABLE IF NOT EXISTS work_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activity VARCHAR(255) NOT NULL,
  category VARCHAR(20) CHECK (category IN ('productive', 'distracted', 'neutral')),
  details TEXT,
  screenshot_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスを作成してクエリを高速化
CREATE INDEX IF NOT EXISTS idx_work_logs_user_timestamp ON work_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_work_logs_category ON work_logs(category);

-- サンプルデータを挿入
INSERT INTO work_logs (user_id, activity, category, details) VALUES
('demo-user', 'コード編集', 'productive', 'React コンポーネントの実装中。useState と useEffect を使用してステート管理を行っている。'),
('demo-user', 'ブラウザ閲覧', 'distracted', 'Twitter を閲覧中。技術系のツイートを見ているが、作業とは直接関係ない内容。'),
('demo-user', 'ドキュメント確認', 'productive', 'Next.js の公式ドキュメントを確認。App Router の使い方について調査中。');
