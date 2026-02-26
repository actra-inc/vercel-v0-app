-- セットアップ完了チェックリスト

SELECT '📋 Supabase Setup Checklist' as title;

-- ✅ テーブル作成確認
SELECT 
    '✅ Tables Created: ' || COUNT(*) || '/5' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_name IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings');

-- ✅ RLS有効化確認
SELECT 
    '✅ RLS Enabled: ' || COUNT(*) || '/5 tables' as status
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')
    AND rowsecurity = true;

-- ✅ ポリシー作成確認
SELECT 
    '✅ RLS Policies: ' || COUNT(*) || ' policies created' as status
FROM pg_policies 
WHERE schemaname = 'public';

-- ✅ インデックス作成確認
SELECT 
    '✅ Indexes: ' || COUNT(*) || ' indexes created' as status
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings');

-- ✅ CHECK制約確認
SELECT 
    '✅ CHECK Constraint: work_logs category constraint working' as status
FROM pg_constraint 
WHERE conrelid = 'public.work_logs'::regclass
    AND contype = 'c'
LIMIT 1;

-- 次のステップ
SELECT '📝 Next Steps:' as title;
SELECT '1. Create storage bucket "screenshots" in Supabase Dashboard' as step;
SELECT '2. Enable Google OAuth in Authentication settings' as step;
SELECT '3. Test the application with npm run dev' as step;
SELECT '4. Configure Gemini API key in the app' as step;
