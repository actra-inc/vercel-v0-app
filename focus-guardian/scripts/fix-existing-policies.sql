-- Drop existing policies if they exist
DO $$ 
BEGIN
    -- Drop policies for users table
    DROP POLICY IF EXISTS "Users can view own data" ON users;
    DROP POLICY IF EXISTS "Users can update own data" ON users;
    DROP POLICY IF EXISTS "Users can insert own data" ON users;

    -- Drop policies for projects table
    DROP POLICY IF EXISTS "Users can view own projects" ON projects;
    DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
    DROP POLICY IF EXISTS "Users can update own projects" ON projects;
    DROP POLICY IF EXISTS "Users can delete own projects" ON projects;

    -- Drop policies for time_entries table
    DROP POLICY IF EXISTS "Users can view own time entries" ON time_entries;
    DROP POLICY IF EXISTS "Users can insert own time entries" ON time_entries;
    DROP POLICY IF EXISTS "Users can update own time entries" ON time_entries;
    DROP POLICY IF EXISTS "Users can delete own time entries" ON time_entries;

    -- Drop policies for work_logs table
    DROP POLICY IF EXISTS "Users can view own work logs" ON work_logs;
    DROP POLICY IF EXISTS "Users can insert own work logs" ON work_logs;
    DROP POLICY IF EXISTS "Users can update own work logs" ON work_logs;
    DROP POLICY IF EXISTS "Users can delete own work logs" ON work_logs;

    -- Drop policies for user_settings table
    DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
    DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
    DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
    DROP POLICY IF EXISTS "Users can delete own settings" ON user_settings;
END $$;

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    client TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    activity TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('productive', 'distracted', 'neutral')),
    details TEXT DEFAULT '',
    screenshot_url TEXT,
    confidence DECIMAL(3,2),
    applications TEXT[] DEFAULT '{}',
    focus_score DECIMAL(3,2),
    distraction_check JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    gemini_api_key TEXT,
    gemini_model TEXT DEFAULT 'gemini-2.5-flash-lite',
    toggl_api_token TEXT,
    toggl_workspace_id TEXT,
    capture_interval INTEGER DEFAULT 30,
    auto_sync_toggl BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users table policies
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own data" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects table policies
CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- Time entries table policies
CREATE POLICY "Users can view own time entries" ON time_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own time entries" ON time_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own time entries" ON time_entries
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own time entries" ON time_entries
    FOR DELETE USING (auth.uid() = user_id);

-- Work logs table policies
CREATE POLICY "Users can view own work logs" ON work_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own work logs" ON work_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own work logs" ON work_logs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own work logs" ON work_logs
    FOR DELETE USING (auth.uid() = user_id);

-- User settings table policies
CREATE POLICY "Users can view own settings" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings" ON user_settings
    FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_user_id ON work_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_timestamp ON work_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_time_entries_updated_at ON time_entries;
CREATE TRIGGER update_time_entries_updated_at
    BEFORE UPDATE ON time_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
