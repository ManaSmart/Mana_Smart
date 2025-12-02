-- Fix RLS policy for backup_history to allow service_role updates
-- The issue is that auth.role() might not work correctly with REST API
-- This policy allows service_role to update, and service_role key should bypass RLS anyway

-- Drop the existing policy
DROP POLICY IF EXISTS "Allow service role to manage backup history" ON backup_history;

-- Create a new policy that properly allows service_role
-- Using true for service_role (which should bypass RLS anyway, but this ensures it works)
CREATE POLICY "Allow service role to manage backup history"
    ON backup_history FOR ALL
    USING (true)  -- Service role key automatically bypasses RLS, but this ensures it works
    WITH CHECK (true);

-- Also ensure service_role has proper permissions
GRANT ALL ON backup_history TO service_role;
GRANT ALL ON backup_history TO anon;  -- For Edge Functions
GRANT ALL ON backup_history TO authenticated;  -- For authenticated users

-- Keep the read policy for authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to view backup history" ON backup_history;
CREATE POLICY "Allow authenticated users to view backup history"
    ON backup_history FOR SELECT
    USING (true);

