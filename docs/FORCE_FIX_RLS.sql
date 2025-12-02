-- FORCE FIX RLS - Run this entire script
-- This will aggressively fix all RLS issues

-- ============================================
-- PART 1: Fix file_metadata table RLS
-- ============================================

-- Drop ALL policies (using a loop to catch all)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'file_metadata'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON file_metadata', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Force disable RLS
ALTER TABLE IF EXISTS file_metadata DISABLE ROW LEVEL SECURITY;

-- Grant ALL permissions to all roles
GRANT ALL PRIVILEGES ON TABLE file_metadata TO anon;
GRANT ALL PRIVILEGES ON TABLE file_metadata TO authenticated;
GRANT ALL PRIVILEGES ON TABLE file_metadata TO public;
GRANT ALL PRIVILEGES ON TABLE file_metadata TO service_role;

-- Also grant on sequence if it exists
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO public;

-- ============================================
-- PART 2: Verify the fix
-- ============================================
SELECT 
    'file_metadata RLS Status:' as check_type,
    tablename,
    CASE WHEN rowsecurity THEN 'ENABLED ✗' ELSE 'DISABLED ✓' END as status
FROM pg_tables 
WHERE tablename = 'file_metadata';

SELECT 
    'Remaining Policies:' as check_type,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename = 'file_metadata';

SELECT 
    'Permissions:' as check_type,
    grantee,
    string_agg(privilege_type, ', ') as privileges
FROM information_schema.role_table_grants 
WHERE table_name = 'file_metadata'
GROUP BY grantee;

-- ============================================
-- PART 3: If still not working, check storage buckets
-- ============================================
-- Note: Storage bucket policies are separate from table RLS
-- Check your storage bucket policies in Supabase Dashboard > Storage > Policies

