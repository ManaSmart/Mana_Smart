-- Re-enable RLS with simple working policies
ALTER TABLE company_branding ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "All authenticated users can view branding" ON company_branding;
DROP POLICY IF EXISTS "Users with settings permission can manage branding" ON company_branding;
DROP POLICY IF EXISTS "Allow branding insert for testing" ON company_branding;
DROP POLICY IF EXISTS "Allow branding update for testing" ON company_branding;

-- Simple policy: Allow all authenticated users to read branding
CREATE POLICY "Allow authenticated users to read branding" ON company_branding
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Simple policy: Allow all authenticated users to write branding (for now)
CREATE POLICY "Allow authenticated users to write branding" ON company_branding
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
