-- Enable RLS on company_branding table and create policies
ALTER TABLE company_branding ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies first
DROP POLICY IF EXISTS "All authenticated users can view branding" ON company_branding;
DROP POLICY IF EXISTS "Users with settings permission can manage branding" ON company_branding;
DROP POLICY IF EXISTS "Allow branding insert for testing" ON company_branding;
DROP POLICY IF EXISTS "Allow branding update for testing" ON company_branding;

-- Create policies for company_branding
CREATE POLICY "All authenticated users can view branding" ON company_branding
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users with settings permission can manage branding" ON company_branding
  FOR ALL
  USING (
    auth.jwt() ->> 'permissions' = '"all"' OR
    (
      auth.jwt() ->> 'has_valid_role' = 'true' AND
      auth.jwt() -> 'permissions' ? 'settings' AND
      auth.jwt() -> 'permissions' -> 'settings' ? 'update'
    )
  )
  WITH CHECK (
    auth.jwt() ->> 'permissions' = '"all"' OR
    (
      auth.jwt() ->> 'has_valid_role' = 'true' AND
      auth.jwt() -> 'permissions' ? 'settings' AND
      auth.jwt() -> 'permissions' -> 'settings' ? 'update'
    )
  );

-- Temporary: Allow all authenticated users to insert branding for testing
CREATE POLICY "Allow branding insert for testing" ON company_branding
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Temporary: Allow all authenticated users to update branding for testing
CREATE POLICY "Allow branding update for testing" ON company_branding
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
  );
