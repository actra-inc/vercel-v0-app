-- Manual check for the category constraint
-- Run this to specifically verify the CHECK constraint is working

-- Method 1: Check constraint exists in system catalog
SELECT 
  conname as constraint_name,
  contype as type,
  conrelid::regclass as table_name
FROM pg_constraint 
WHERE conrelid = 'public.work_logs'::regclass
  AND contype = 'c';

-- Method 2: Try to insert invalid data (should fail)
-- This will show an error if constraint is working
INSERT INTO public.work_logs (
  user_id, 
  activity, 
  category, 
  details
) VALUES (
  gen_random_uuid(), 
  'Test Activity', 
  'invalid_category_value', 
  'This should fail due to CHECK constraint'
);

-- If the above INSERT fails with a check constraint violation, 
-- the constraint is working correctly!

-- Method 3: Insert valid data (should succeed if RLS allows)
INSERT INTO public.work_logs (
  user_id, 
  activity, 
  category, 
  details
) VALUES (
  gen_random_uuid(), 
  'Test Activity', 
  'productive', 
  'This should work with valid category'
);
