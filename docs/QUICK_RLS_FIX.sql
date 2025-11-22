-- Quick RLS Fix - Very permissive policy for custom auth
-- Run this in Supabase SQL Editor to fix the RLS issue immediately

-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can insert own files" ON file_metadata;

-- Create a very permissive insert policy for custom auth
-- This allows any insert as long as owner_id is provided
CREATE POLICY "Users can insert own files"
    ON file_metadata FOR INSERT
    WITH CHECK (owner_id IS NOT NULL);

-- Verify the policy was created
SELECT * FROM pg_policies WHERE tablename = 'file_metadata' AND policyname = 'Users can insert own files';

