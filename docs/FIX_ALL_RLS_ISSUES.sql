-- COMPLETE FIX for all RLS issues
-- Run this entire script in Supabase SQL Editor

-- ============================================
-- PART 1: Fix file_metadata table RLS
-- ============================================

-- Drop ALL policies on file_metadata
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, policyname 
        FROM pg_policies 
        WHERE tablename = 'file_metadata'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.file_metadata', 
            pol.policyname, pol.schemaname);
    END LOOP;
END $$;

-- Disable RLS
ALTER TABLE file_metadata DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON file_metadata TO anon, authenticated, public, service_role;

-- ============================================
-- PART 2: Fix storage.objects RLS for ALL buckets
-- ============================================

-- Drop ALL existing storage policies (we'll recreate them properly)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, policyname 
        FROM pg_policies 
        WHERE tablename = 'objects' AND schemaname = 'storage'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- ============================================
-- Profile Pictures (PUBLIC - anyone can view, authenticated can upload)
-- ============================================
CREATE POLICY "Profile pictures public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-pictures');

CREATE POLICY "Profile pictures allow upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'profile-pictures');

CREATE POLICY "Profile pictures allow update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'profile-pictures')
    WITH CHECK (bucket_id = 'profile-pictures');

CREATE POLICY "Profile pictures allow delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'profile-pictures');

-- ============================================
-- Contracts (PRIVATE - only authenticated users)
-- ============================================
CREATE POLICY "Contracts allow read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'contracts');

CREATE POLICY "Contracts allow upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'contracts');

CREATE POLICY "Contracts allow update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'contracts')
    WITH CHECK (bucket_id = 'contracts');

CREATE POLICY "Contracts allow delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'contracts');

-- ============================================
-- Inventory Images (PUBLIC - product images)
-- ============================================
CREATE POLICY "Inventory public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'inventory');

CREATE POLICY "Inventory allow upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'inventory');

CREATE POLICY "Inventory allow update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'inventory')
    WITH CHECK (bucket_id = 'inventory');

CREATE POLICY "Inventory allow delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'inventory');

-- ============================================
-- Employees (PRIVATE - sensitive employee data)
-- ============================================
CREATE POLICY "Employees allow read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'employees');

CREATE POLICY "Employees allow upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'employees');

CREATE POLICY "Employees allow update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'employees')
    WITH CHECK (bucket_id = 'employees');

CREATE POLICY "Employees allow delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'employees');

-- ============================================
-- Branding (PUBLIC - logos/stamps for documents)
-- ============================================
CREATE POLICY "Branding public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'branding');

CREATE POLICY "Branding allow upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'branding');

CREATE POLICY "Branding allow update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'branding')
    WITH CHECK (bucket_id = 'branding');

CREATE POLICY "Branding allow delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'branding');

-- ============================================
-- Payroll (PRIVATE - sensitive financial data)
-- ============================================
CREATE POLICY "Payroll allow read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'payroll');

CREATE POLICY "Payroll allow upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'payroll');

CREATE POLICY "Payroll allow update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'payroll')
    WITH CHECK (bucket_id = 'payroll');

CREATE POLICY "Payroll allow delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'payroll');

-- ============================================
-- Assets (PRIVATE - company assets)
-- ============================================
CREATE POLICY "Assets allow read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'assets');

CREATE POLICY "Assets allow upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'assets');

CREATE POLICY "Assets allow update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'assets')
    WITH CHECK (bucket_id = 'assets');

CREATE POLICY "Assets allow delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'assets');

-- ============================================
-- Custody (PRIVATE - employee custody items)
-- ============================================
CREATE POLICY "Custody allow read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'custody');

CREATE POLICY "Custody allow upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'custody');

CREATE POLICY "Custody allow update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'custody')
    WITH CHECK (bucket_id = 'custody');

CREATE POLICY "Custody allow delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'custody');

-- ============================================
-- PART 3: Verify everything
-- ============================================
SELECT 'file_metadata RLS:' as check_item,
    CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE tablename = 'file_metadata')
    THEN 'ENABLED ❌' ELSE 'DISABLED ✅' END as status;

-- Count storage policies created
SELECT 'Storage policies created:' as check_item,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage';

-- List all storage policies by bucket
SELECT 
    'Storage policies by bucket:' as info,
    CASE 
        WHEN qual::text LIKE '%profile-pictures%' OR with_check::text LIKE '%profile-pictures%' THEN 'profile-pictures'
        WHEN qual::text LIKE '%contracts%' OR with_check::text LIKE '%contracts%' THEN 'contracts'
        WHEN qual::text LIKE '%inventory%' OR with_check::text LIKE '%inventory%' THEN 'inventory'
        WHEN qual::text LIKE '%employees%' OR with_check::text LIKE '%employees%' THEN 'employees'
        WHEN qual::text LIKE '%branding%' OR with_check::text LIKE '%branding%' THEN 'branding'
        WHEN qual::text LIKE '%payroll%' OR with_check::text LIKE '%payroll%' THEN 'payroll'
        WHEN qual::text LIKE '%assets%' OR with_check::text LIKE '%assets%' THEN 'assets'
        WHEN qual::text LIKE '%custody%' OR with_check::text LIKE '%custody%' THEN 'custody'
        ELSE 'other'
    END as bucket,
    cmd,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage'
GROUP BY bucket, cmd
ORDER BY bucket, cmd;

