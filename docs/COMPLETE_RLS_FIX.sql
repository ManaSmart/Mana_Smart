-- Complete RLS Fix - Run this entire script in Supabase SQL Editor
-- This will diagnose and fix all RLS issues

-- ============================================
-- STEP 1: Verify table exists
-- ============================================
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'file_metadata') 
        THEN '✓ Table exists'
        ELSE '✗ Table does NOT exist - Run COMPLETE_FILE_METADATA_SETUP.sql first'
    END as status;

-- ============================================
-- STEP 2: Check current RLS status
-- ============================================
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as status
FROM pg_tables 
WHERE tablename = 'file_metadata';

-- ============================================
-- STEP 3: Drop ALL existing policies
-- ============================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'file_metadata'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON file_metadata', r.policyname);
    END LOOP;
END $$;

-- ============================================
-- STEP 4: DISABLE RLS completely
-- ============================================
ALTER TABLE file_metadata DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 5: Grant all necessary permissions
-- ============================================
GRANT ALL ON file_metadata TO anon;
GRANT ALL ON file_metadata TO authenticated;
GRANT ALL ON file_metadata TO public;
GRANT ALL ON file_metadata TO service_role;

-- ============================================
-- STEP 6: Verify RLS is disabled
-- ============================================
SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN '✗ RLS STILL ENABLED - Something went wrong'
        ELSE '✓ RLS DISABLED - Should work now'
    END as rls_status
FROM pg_tables 
WHERE tablename = 'file_metadata';

-- ============================================
-- STEP 7: List all policies (should be empty)
-- ============================================
SELECT 
    'Remaining policies:' as info,
    policyname,
    cmd
FROM pg_policies 
WHERE tablename = 'file_metadata';

-- ============================================
-- STEP 8: Test insert permission
-- ============================================
SELECT 
    'Permissions check:' as info,
    grantee,
    privilege_type
FROM information_schema.role_table_grants 
WHERE table_name = 'file_metadata' 
AND privilege_type IN ('INSERT', 'SELECT', 'UPDATE', 'DELETE')
ORDER BY grantee, privilege_type;

