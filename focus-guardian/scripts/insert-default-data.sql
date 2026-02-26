-- Insert default projects for demo (optional)
-- Note: These will only work after a user is authenticated and their UUID is known
-- You can run this later or let the app create default projects programmatically

-- Example of how to insert default projects for a specific user:
-- Replace 'your-user-uuid-here' with actual user UUID after authentication

/*
INSERT INTO public.projects (user_id, name, color, client) VALUES
  ('your-user-uuid-here', '開発作業', '#3b82f6', '個人'),
  ('your-user-uuid-here', '学習・調査', '#10b981', '個人'),
  ('your-user-uuid-here', '会議・打ち合わせ', '#f59e0b', 'チーム'),
  ('your-user-uuid-here', 'その他', '#6b7280', '個人')
ON CONFLICT DO NOTHING;
*/

-- Instead, we'll handle default project creation in the application code
