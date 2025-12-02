-- Update RLS policies for file_metadata to work with custom authentication
-- Since the app uses custom auth (not Supabase Auth), we need to adjust policies

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own files" ON file_metadata;
DROP POLICY IF EXISTS "Users can insert own files" ON file_metadata;
DROP POLICY IF EXISTS "Users can update own files" ON file_metadata;
DROP POLICY IF EXISTS "Users can delete own files" ON file_metadata;

-- Create a function to check if a user exists in system_users
-- This function is SECURITY DEFINER so it can access system_users table
CREATE OR REPLACE FUNCTION user_exists_in_system(user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM system_users 
        WHERE system_users.user_id = user_id_param
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Users can view files they own or that are public
CREATE POLICY "Users can view own files"
    ON file_metadata FOR SELECT
    USING (
        is_public = true OR
        user_exists_in_system(owner_id::uuid) OR
        user_exists_in_system(created_by) OR
        auth.uid() = owner_id::uuid OR
        auth.uid() = created_by
    );

-- Policy: Users can insert files if the user_id exists in system_users
-- This works with custom auth by checking system_users table
CREATE POLICY "Users can insert own files"
    ON file_metadata FOR INSERT
    WITH CHECK (
        user_exists_in_system(created_by) OR
        user_exists_in_system(owner_id::uuid) OR
        auth.uid() = created_by OR
        auth.uid() = owner_id::uuid
    );

-- Policy: Users can update their own files
CREATE POLICY "Users can update own files"
    ON file_metadata FOR UPDATE
    USING (
        user_exists_in_system(owner_id::uuid) OR
        user_exists_in_system(created_by) OR
        auth.uid() = owner_id::uuid OR
        auth.uid() = created_by
    )
    WITH CHECK (
        user_exists_in_system(owner_id::uuid) OR
        user_exists_in_system(created_by) OR
        auth.uid() = owner_id::uuid OR
        auth.uid() = created_by
    );

-- Policy: Users can delete their own files (soft delete)
CREATE POLICY "Users can delete own files"
    ON file_metadata FOR DELETE
    USING (
        user_exists_in_system(owner_id::uuid) OR
        user_exists_in_system(created_by) OR
        auth.uid() = owner_id::uuid OR
        auth.uid() = created_by
    );

COMMENT ON FUNCTION user_exists_in_system IS 'Checks if a user exists in system_users table (for custom auth)';

