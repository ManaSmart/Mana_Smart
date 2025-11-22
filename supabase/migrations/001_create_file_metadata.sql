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

CREATE TRIGGER file_metadata_updated_at
    BEFORE UPDATE ON file_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_file_metadata_updated_at();

-- RLS Policies for file_metadata

-- Policy: Users can view their own files
CREATE POLICY "Users can view own files"
    ON file_metadata FOR SELECT
    USING (
        auth.uid() = owner_id::uuid OR
        auth.uid() = created_by OR
        is_public = true
    );

-- Policy: Users can insert their own files
CREATE POLICY "Users can insert own files"
    ON file_metadata FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- Policy: Users can update their own files
CREATE POLICY "Users can update own files"
    ON file_metadata FOR UPDATE
    USING (auth.uid() = owner_id::uuid OR auth.uid() = created_by)
    WITH CHECK (auth.uid() = owner_id::uuid OR auth.uid() = created_by);

-- Policy: Users can delete their own files (soft delete)
CREATE POLICY "Users can delete own files"
    ON file_metadata FOR DELETE
    USING (auth.uid() = owner_id::uuid OR auth.uid() = created_by);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON file_metadata TO authenticated;
GRANT SELECT ON file_metadata TO anon;

COMMENT ON TABLE file_metadata IS 'Stores metadata for all files uploaded to Supabase Storage';
COMMENT ON COLUMN file_metadata.owner_type IS 'Type of owner: user, employee, customer, contract, inventory, asset, etc.';
COMMENT ON COLUMN file_metadata.category IS 'File category: profile_picture, contract_file, inventory_image, employee_document, etc.';
COMMENT ON COLUMN file_metadata.is_public IS 'Whether the file is publicly accessible without authentication';

