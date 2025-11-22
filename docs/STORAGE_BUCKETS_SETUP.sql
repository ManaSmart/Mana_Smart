-- ============================================
-- Supabase Storage Buckets Setup
-- ============================================
-- Run this in Supabase SQL Editor to create all storage buckets
-- ============================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  -- Profile Pictures (Public)
  ('profile-pictures', 'profile-pictures', true, 5242880, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
  
  -- Contracts (Private)
  ('contracts', 'contracts', false, 10485760, ARRAY['application/pdf']),
  
  -- Inventory Images (Public)
  ('inventory', 'inventory', true, 5242880, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
  
  -- Employees (Private)
  ('employees', 'employees', false, 10485760, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  
  -- Branding (Public for logos, but we'll handle access via RLS)
  ('branding', 'branding', true, 2097152, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml']),
  
  -- Payroll (Private)
  ('payroll', 'payroll', false, 10485760, ARRAY['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  
  -- Assets (Private)
  ('assets', 'assets', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  
  -- Custody (Private)
  ('custody', 'custody', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'])
ON CONFLICT (id) DO UPDATE
SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================
-- Storage Policies
-- ============================================

-- Profile Pictures Policies
CREATE POLICY "Profile pictures are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-pictures');

CREATE POLICY "Authenticated users can upload profile pictures"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-pictures' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Users can update own profile pictures"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-pictures' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'profile-pictures' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own profile pictures"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-pictures' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Contracts Policies
CREATE POLICY "Authenticated users can view contract files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contracts' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can upload contract files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contracts' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can update contract files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'contracts' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'contracts' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can delete contract files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'contracts' 
    AND auth.role() = 'authenticated'
  );

-- Inventory Policies
CREATE POLICY "Inventory images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inventory');

CREATE POLICY "Authenticated users can manage inventory images"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'inventory' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'inventory' 
    AND auth.role() = 'authenticated'
  );

-- Employees Policies (Private)
CREATE POLICY "Authenticated users can view employee files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'employees' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can manage employee files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'employees' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'employees' 
    AND auth.role() = 'authenticated'
  );

-- Branding Policies
CREATE POLICY "Branding files are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

CREATE POLICY "Authenticated users can manage branding files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'branding' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'branding' 
    AND auth.role() = 'authenticated'
  );

-- Payroll Policies (Private)
CREATE POLICY "Authenticated users can view payroll files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payroll' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can manage payroll files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'payroll' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'payroll' 
    AND auth.role() = 'authenticated'
  );

-- Assets Policies (Private)
CREATE POLICY "Authenticated users can view asset files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'assets' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can manage asset files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'assets' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'assets' 
    AND auth.role() = 'authenticated'
  );

-- Custody Policies (Private)
CREATE POLICY "Authenticated users can view custody files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'custody' 
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can manage custody files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'custody' 
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'custody' 
    AND auth.role() = 'authenticated'
  );

-- ============================================
-- Notes
-- ============================================
-- File size limits are in bytes:
--   5242880 = 5 MB
--   10485760 = 10 MB
--   20971520 = 20 MB
--
-- For more granular access control, you can modify policies
-- to check file_metadata table for ownership information.
-- ============================================

