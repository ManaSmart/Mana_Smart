-- Diagnostic and Fix Script for file_metadata RLS
-- Run this in Supabase SQL Editor

-- Step 1: Check if table exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'file_metadata') 
        THEN 'Table exists ✓'
        ELSE 'Table does NOT exist ✗ - Run COMPLETE_FILE_METADATA_SETUP.sql first'
    END as table_status;

-- Step 2: Check current RLS status
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'file_metadata';

-- Step 3: List all current policies
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'file_metadata'
ORDER BY cmd, policyname;

-- Step 4: Drop ALL existing policies
DROP POLICY IF EXISTS "Users can insert own files" ON file_metadata;
DROP POLICY IF EXISTS "Allow all authenticated inserts" ON file_metadata;
DROP POLICY IF EXISTS "Permissive insert policy" ON file_metadata;
DROP POLICY IF EXISTS "Permissive insert policy anon" ON file_metadata;
DROP POLICY IF EXISTS "Allow all inserts" ON file_metadata;
DROP POLICY IF EXISTS "Allow all inserts authenticated" ON file_metadata;
DROP POLICY IF EXISTS "Allow all inserts anon" ON file_metadata;
DROP POLICY IF EXISTS "Allow all inserts public" ON file_metadata;

-- Step 5: Temporarily DISABLE RLS for testing (REMOVE THIS AFTER TESTING!)
ALTER TABLE file_metadata DISABLE ROW LEVEL SECURITY;

-- Step 6: Verify RLS is disabled
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'file_metadata';

-- If you want to re-enable RLS later with permissive policies, run:
-- ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all inserts" ON file_metadata FOR INSERT WITH CHECK (true);

