-- Verify that all tables and policies were created correctly

-- Check tables
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')
ORDER BY table_name, ordinal_position;

-- Check RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings');

-- Check policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')
ORDER BY tablename, indexname;
