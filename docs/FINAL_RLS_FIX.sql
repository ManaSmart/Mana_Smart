-- FINAL RLS FIX - Run this in Supabase SQL Editor
-- This addresses both table RLS and verifies everything

-- ============================================
-- STEP 1: Check table exists and location
-- ============================================
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'file_metadata';

-- ============================================
-- STEP 2: Drop ALL policies (aggressive)
-- ============================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, policyname 
        FROM pg_policies 
        WHERE tablename = 'file_metadata'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
            pol.policyname, pol.schemaname, 'file_metadata');
        RAISE NOTICE 'Dropped: %.%', pol.schemaname, pol.policyname;
    END LOOP;
END $$;

-- ============================================
-- STEP 3: DISABLE RLS (force)
-- ============================================
ALTER TABLE file_metadata DISABLE ROW LEVEL SECURITY;

-- If table is in public schema, be explicit:
ALTER TABLE public.file_metadata DISABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 4: Grant ALL permissions
-- ============================================
GRANT ALL ON file_metadata TO anon;
GRANT ALL ON file_metadata TO authenticated;  
GRANT ALL ON file_metadata TO public;
GRANT ALL ON file_metadata TO service_role;

-- Grant on public schema explicitly
GRANT ALL ON public.file_metadata TO anon;
GRANT ALL ON public.file_metadata TO authenticated;
GRANT ALL ON public.file_metadata TO public;

-- ============================================
-- STEP 5: Verify RLS is disabled
-- ============================================
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    CASE 
        WHEN rowsecurity THEN '❌ STILL ENABLED'
        ELSE '✅ DISABLED'
    END as status
FROM pg_tables 
WHERE tablename = 'file_metadata';

-- ============================================
-- STEP 6: Check storage bucket policies
-- ============================================
-- The error might also be from storage.objects RLS
-- Check if profile-pictures bucket has restrictive policies

SELECT 
    'Storage Policies Check' as info,
    policyname,
    cmd,
    bucket_id
FROM pg_policies 
WHERE tablename = 'objects' 
AND (bucket_id = 'profile-pictures' OR bucket_id IS NULL)
LIMIT 10;

-- ============================================
-- STEP 7: If storage policies are blocking, fix them
-- ============================================
-- Drop restrictive storage policies for profile-pictures
DROP POLICY IF EXISTS "Authenticated users can upload profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own profile pictures" ON storage.objects;

-- Create permissive storage policy
CREATE POLICY "Allow profile picture uploads"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'profile-pictures');

CREATE POLICY "Allow profile picture reads"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-pictures');

-- ============================================
-- STEP 8: Final verification
-- ============================================
SELECT '✅ Fix Complete' as status;
SELECT 'file_metadata RLS:' as check_item, 
    CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE tablename = 'file_metadata') 
    THEN 'ENABLED ❌' ELSE 'DISABLED ✅' END as result;

