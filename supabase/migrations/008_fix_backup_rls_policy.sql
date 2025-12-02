-- Fix RLS policy for system_settings_kv to allow service_role updates
-- This allows GitHub Actions (using service_role key) to update last_backup_at

-- Drop the existing policy
DROP POLICY IF EXISTS "Allow service role to manage backup settings" ON system_settings_kv;

-- Create a new policy that properly allows service_role
-- Service role key should bypass RLS, but this ensures it works
CREATE POLICY "Allow service role to manage backup settings"
    ON system_settings_kv FOR ALL
    USING (true)  -- Service role key automatically bypasses RLS, but this ensures it works
    WITH CHECK (true);

-- Also ensure service_role has proper permissions
GRANT ALL ON system_settings_kv TO service_role;
GRANT ALL ON system_settings_kv TO anon;  -- For Edge Functions
GRANT ALL ON system_settings_kv TO authenticated;  -- For authenticated users

