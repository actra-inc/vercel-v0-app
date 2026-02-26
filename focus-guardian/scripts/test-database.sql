-- Test script to verify database setup
-- Run this after the main schema creation

-- Test 1: Check if all tables exist
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')
ORDER BY table_name;

-- Test 2: Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')
ORDER BY tablename;

-- Test 3: Check if indexes exist
SELECT 
  indexname,
  tablename
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')
ORDER BY tablename, indexname;

-- Test 4: Check if policies exist
SELECT 
  tablename,
  policyname,
  cmd as operation
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Test 5: Check work_logs category constraint
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  consrc as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.work_logs'::regclass
  AND contype = 'c';

SELECT 'Database tests completed!' as status;
