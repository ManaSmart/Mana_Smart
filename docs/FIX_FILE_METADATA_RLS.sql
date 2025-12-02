-- Quick fix for file_metadata RLS policy issue
-- Run this in Supabase SQL Editor to fix the "new row violates row-level security policy" error

-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can insert own files" ON file_metadata;

-- Create a function to check if user exists in system_users
CREATE OR REPLACE FUNCTION user_exists_in_system(user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM system_users 
        WHERE system_users.user_id = user_id_param
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new insert policy that works with custom auth
-- This allows inserts if the user_id exists in system_users table
CREATE POLICY "Users can insert own files"
    ON file_metadata FOR INSERT
    WITH CHECK (
        user_exists_in_system(created_by) OR
        user_exists_in_system(owner_id::uuid) OR
        auth.uid() = created_by OR
        auth.uid() = owner_id::uuid
    );

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION user_exists_in_system TO authenticated;
GRANT EXECUTE ON FUNCTION user_exists_in_system TO anon;

