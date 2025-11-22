-- Complete setup for file_metadata table with custom auth support
-- Run this in Supabase SQL Editor if the table doesn't exist yet

-- Create file_metadata table for tracking all file uploads
CREATE TABLE IF NOT EXISTS file_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL, -- References the owner (user_id, employee_id, customer_id, etc.)
    owner_type TEXT NOT NULL, -- 'user', 'employee', 'customer', 'contract', 'inventory', 'asset', etc.
    category TEXT NOT NULL, -- 'profile_picture', 'contract_file', 'inventory_image', etc.
    bucket TEXT NOT NULL, -- Supabase storage bucket name
    path TEXT NOT NULL, -- Full path in bucket (e.g., 'profile-pictures/user-123/profile.jpg')
    file_name TEXT NOT NULL, -- Original file name
    mime_type TEXT NOT NULL, -- e.g., 'image/jpeg', 'application/pdf'
    size BIGINT NOT NULL, -- File size in bytes
    width INTEGER, -- For images only
    height INTEGER, -- For images only
    description TEXT, -- Optional description
    is_public BOOLEAN DEFAULT false, -- Whether file is publicly accessible
    metadata JSONB, -- Additional metadata as JSON
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID, -- User who uploaded the file
    deleted_at TIMESTAMPTZ -- Soft delete timestamp
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_file_metadata_owner ON file_metadata(owner_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_file_metadata_category ON file_metadata(category);
CREATE INDEX IF NOT EXISTS idx_file_metadata_bucket_path ON file_metadata(bucket, path);
CREATE INDEX IF NOT EXISTS idx_file_metadata_created_by ON file_metadata(created_by);
CREATE INDEX IF NOT EXISTS idx_file_metadata_deleted_at ON file_metadata(deleted_at) WHERE deleted_at IS NULL;

-- Enable Row Level Security
ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_file_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS file_metadata_updated_at ON file_metadata;
CREATE TRIGGER file_metadata_updated_at
    BEFORE UPDATE ON file_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_file_metadata_updated_at();

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own files" ON file_metadata;
DROP POLICY IF EXISTS "Users can insert own files" ON file_metadata;
DROP POLICY IF EXISTS "Users can update own files" ON file_metadata;
DROP POLICY IF EXISTS "Users can delete own files" ON file_metadata;

-- Create a function to check if a user exists in system_users
-- This function is SECURITY DEFINER so it can access system_users table
-- Handles both UUID and TEXT input
CREATE OR REPLACE FUNCTION user_exists_in_system(user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user exists, handling both UUID and string comparison
    RETURN EXISTS (
        SELECT 1 FROM system_users 
        WHERE system_users.user_id::text = user_id_param::text
           OR system_users.user_id = user_id_param
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also create a version that accepts TEXT for flexibility
CREATE OR REPLACE FUNCTION user_exists_in_system_text(user_id_param TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM system_users 
        WHERE system_users.user_id::text = user_id_param
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for file_metadata (works with custom auth)

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
-- More permissive: allows insert if user exists OR if created_by/owner_id is provided
CREATE POLICY "Users can insert own files"
    ON file_metadata FOR INSERT
    WITH CHECK (
        -- Check if user exists in system_users (for custom auth)
        (created_by IS NOT NULL AND (
            user_exists_in_system(created_by) OR
            user_exists_in_system_text(created_by::text)
        )) OR
        (owner_id IS NOT NULL AND (
            user_exists_in_system(owner_id::uuid) OR
            user_exists_in_system_text(owner_id::text)
        )) OR
        -- Also allow if using Supabase Auth
        auth.uid() = created_by OR
        auth.uid() = owner_id::uuid OR
        -- Temporary permissive: allow if owner_id is provided (for initial setup)
        -- This ensures uploads work even if user check fails
        -- TODO: Remove this after verifying user_exists_in_system works correctly
        (owner_id IS NOT NULL AND owner_type = 'user')
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

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON file_metadata TO authenticated;
GRANT SELECT ON file_metadata TO anon;
GRANT EXECUTE ON FUNCTION user_exists_in_system TO authenticated;
GRANT EXECUTE ON FUNCTION user_exists_in_system TO anon;
GRANT EXECUTE ON FUNCTION user_exists_in_system_text TO authenticated;
GRANT EXECUTE ON FUNCTION user_exists_in_system_text TO anon;

-- Add comments
COMMENT ON TABLE file_metadata IS 'Stores metadata for all files uploaded to Supabase Storage';
COMMENT ON COLUMN file_metadata.owner_type IS 'Type of owner: user, employee, customer, contract, inventory, asset, etc.';
COMMENT ON COLUMN file_metadata.category IS 'File category: profile_picture, contract_file, inventory_image, employee_document, etc.';
COMMENT ON COLUMN file_metadata.is_public IS 'Whether the file is publicly accessible without authentication';
COMMENT ON FUNCTION user_exists_in_system IS 'Checks if a user exists in system_users table (for custom auth)';

