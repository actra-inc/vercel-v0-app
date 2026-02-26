-- Test script to verify database setup (PostgreSQL 12+ compatible)
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

-- Test 5: Check work_logs category constraint (PostgreSQL 12+ compatible)
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  CASE 
    WHEN contype = 'c' THEN 'CHECK constraint'
    WHEN contype = 'f' THEN 'FOREIGN KEY'
    WHEN contype = 'p' THEN 'PRIMARY KEY'
    WHEN contype = 'u' THEN 'UNIQUE'
    ELSE contype::text
  END as constraint_description
FROM pg_constraint 
WHERE conrelid = 'public.work_logs'::regclass
  AND contype = 'c';

-- Test 6: Check column details for work_logs table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'work_logs'
ORDER BY ordinal_position;

-- Test 7: Verify category constraint by attempting invalid insert (should fail)
-- Note: This will show an error if the constraint is working correctly
DO $$
BEGIN
  -- Try to insert invalid category (should fail)
  BEGIN
    INSERT INTO public.work_logs (user_id, activity, category, details) 
    VALUES (gen_random_uuid(), 'test', 'invalid_category', 'test');
    RAISE NOTICE 'ERROR: Category constraint is NOT working - invalid insert succeeded!';
  EXCEPTION 
    WHEN check_violation THEN
      RAISE NOTICE 'SUCCESS: Category constraint is working correctly - invalid insert blocked';
    WHEN OTHERS THEN
      RAISE NOTICE 'INFO: Insert failed for other reason (likely RLS policy) - constraint may be working';
  END;
END $$;

-- Test 8: Check if functions exist
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'handle_updated_at';

-- Test 9: Check if triggers exist
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
  AND event_object_table IN ('users', 'projects', 'time_entries', 'user_settings')
ORDER BY event_object_table, trigger_name;

-- Test 10: Summary report
SELECT 
  'Database Setup Verification Complete' as status,
  (SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')) as tables_created,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') as policies_created,
  (SELECT COUNT(*) FROM pg_indexes 
   WHERE schemaname = 'public' 
   AND tablename IN ('users', 'projects', 'time_entries', 'work_logs', 'user_settings')) as indexes_created;
