-- Create storage bucket for screenshots
-- Note: This needs to be run in the Supabase dashboard Storage section
-- or via the Supabase CLI, not in SQL Editor

-- Instructions for manual creation:
-- 1. Go to Storage in Supabase dashboard
-- 2. Click "Create bucket"
-- 3. Name: "screenshots"
-- 4. Enable "Public bucket" if you want public access
-- 5. Click "Create bucket"

-- If you have the necessary permissions, you can try this SQL:
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('screenshots', 'screenshots', true)
-- ON CONFLICT (id) DO NOTHING;

SELECT 'Please create storage bucket "screenshots" manually in Supabase dashboard' as instruction;
