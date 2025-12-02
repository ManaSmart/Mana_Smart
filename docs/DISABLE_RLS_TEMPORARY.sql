-- TEMPORARY FIX: Disable RLS for file_metadata table
-- This will allow inserts to work immediately
-- Run this in Supabase SQL Editor

-- Check if table exists first
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'file_metadata') THEN
        RAISE EXCEPTION 'file_metadata table does not exist. Please run COMPLETE_FILE_METADATA_SETUP.sql first.';
    END IF;
END $$;

-- Disable RLS temporarily
ALTER TABLE file_metadata DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN 'RLS ENABLED'
        ELSE 'RLS DISABLED ✓'
    END as rls_status
FROM pg_tables 
WHERE tablename = 'file_metadata';

-- Note: To re-enable RLS later with proper policies, run:
-- ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;
-- Then create appropriate policies

