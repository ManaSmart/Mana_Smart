-- Simple fix for file_metadata RLS - more permissive for custom auth
-- Run this AFTER running COMPLETE_FILE_METADATA_SETUP.sql

-- Drop the existing insert policy
DROP POLICY IF EXISTS "Users can insert own files" ON file_metadata;

-- Create a simpler, more permissive insert policy
-- This allows inserts if owner_id is provided (for custom auth systems)
CREATE POLICY "Users can insert own files"
    ON file_metadata FOR INSERT
    WITH CHECK (
        -- Allow if owner_id is provided (for custom auth)
        owner_id IS NOT NULL OR
        -- Or if using Supabase Auth
        auth.uid() = created_by OR
        auth.uid() = owner_id::uuid OR
        -- Or if user exists in system_users
        (created_by IS NOT NULL AND EXISTS (
            SELECT 1 FROM system_users 
            WHERE system_users.user_id::text = created_by::text
        )) OR
        (owner_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM system_users 
            WHERE system_users.user_id::text = owner_id::text
        ))
    );

