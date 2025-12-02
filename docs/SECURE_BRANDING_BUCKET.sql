-- ============================================
-- Secure Branding Bucket for Private Logos
-- ============================================
-- This script secures the branding bucket to make logos private
-- Only authenticated users can access logos (no public access)
-- Run this in Supabase SQL Editor

-- ============================================
-- Step 1: Update bucket to be private
-- ============================================
UPDATE storage.buckets
SET public = false
WHERE id = 'branding';

-- ============================================
-- Step 2: Drop existing public read policies
-- ============================================
DROP POLICY IF EXISTS "Branding files are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Branding public read" ON storage.objects;
DROP POLICY IF EXISTS "Branding files public read" ON storage.objects;

-- ============================================
-- Step 3: Create secure policies for branding bucket
-- ============================================

-- Only authenticated users can view branding files (logos/stamps)
CREATE POLICY "Authenticated users can view branding files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'branding' 
    AND auth.role() = 'authenticated'
  );

-- Only authenticated users can upload branding files
CREATE POLICY "Authenticated users can upload branding files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding' 
    AND auth.role() = 'authenticated'
  );

-- Only authenticated users can update branding files
CREATE POLICY "Authenticated users can update branding files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'branding' 
    AND auth.role() = 'authenticated'
  );

-- Only authenticated users can delete branding files
CREATE POLICY "Authenticated users can delete branding files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'branding' 
    AND auth.role() = 'authenticated'
  );

-- ============================================
-- Verification
-- ============================================
-- Check bucket is private
SELECT id, name, public 
FROM storage.buckets 
WHERE id = 'branding';
-- Expected: public = false

-- Check policies exist
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%branding%'
ORDER BY policyname;
-- Expected: 4 policies (SELECT, INSERT, UPDATE, DELETE)

-- ============================================
-- Notes
-- ============================================
-- After running this script:
-- 1. Logos will be private (no public URLs)
-- 2. Only authenticated users can access logos
-- 3. Logos will use signed URLs (expire after 1 hour by default)
-- 4. The app will automatically refresh signed URLs when they expire
-- 5. All new logo uploads will be marked as secured in metadata

