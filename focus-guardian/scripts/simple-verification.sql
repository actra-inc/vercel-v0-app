-- Simple verification script without complex queries
-- Use this if the main test script has issues

-- Check tables
SELECT 'Tables created:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings');

-- Check RLS
SELECT 'RLS Status:' as info;
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings');

-- Check policies count
SELECT 'Policies created:' as info;
SELECT COUNT(*) as policy_count FROM pg_policies WHERE schemaname = 'public';

-- Check work_logs structure
SELECT 'work_logs columns:' as info;
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'work_logs' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT 'Verification complete!' as status;
