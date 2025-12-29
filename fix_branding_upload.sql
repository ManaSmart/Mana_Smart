-- Fix company_branding RLS policies for logo upload
-- This script ensures proper RLS policies are in place

-- First, disable RLS temporarily
ALTER TABLE company_branding DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "All authenticated users can view branding" ON company_branding;
DROP POLICY IF EXISTS "Users with settings permission can manage branding" ON company_branding;
DROP POLICY IF EXISTS "Allow branding insert for testing" ON company_branding;
DROP POLICY IF EXISTS "Allow branding update for testing" ON company_branding;
DROP POLICY IF EXISTS "Allow authenticated users to read branding" ON company_branding;
DROP POLICY IF EXISTS "Allow authenticated users to write branding" ON company_branding;

-- Re-enable RLS
ALTER TABLE company_branding ENABLE ROW LEVEL SECURITY;

-- Create simple, permissive policies that should work
CREATE POLICY "Allow authenticated users to read branding" ON company_branding
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to insert branding" ON company_branding
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to update branding" ON company_branding
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Show the final policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'company_branding';
