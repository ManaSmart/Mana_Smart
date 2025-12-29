-- Re-enable RLS with proper login policies
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that block login
DROP POLICY IF EXISTS "Users can view own profile" ON system_users;
DROP POLICY IF EXISTS "Super admins can manage all users" ON system_users;
DROP POLICY IF EXISTS "Users with employees permission can manage users" ON system_users;

-- Create new policies that allow login
CREATE POLICY "Allow unauthenticated login attempts" ON system_users
  FOR SELECT
  USING (
    -- Allow login queries (email + password_hash) for unauthenticated users
    auth.uid() IS NULL
  );

CREATE POLICY "Users can view own profile" ON system_users
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND user_id = auth.uid()
  );

CREATE POLICY "Super admins can view all users" ON system_users
  FOR SELECT
  USING (
    auth.jwt() ->> 'permissions' = '"all"' AND
    public.verify_role_version(
      (auth.jwt() ->> 'role_id')::UUID, 
      (auth.jwt() ->> 'role_version')::INTEGER
    ) = true AND
    public.check_session_invalidation(auth.uid()) = false
  );

CREATE POLICY "Users with employees permission can manage users" ON system_users
  FOR ALL
  USING (
    auth.jwt() ->> 'has_valid_role' = 'true' AND
    auth.jwt() -> 'permissions' ? 'employees' AND
    auth.jwt() -> 'permissions' -> 'employees' ? 'update' AND
    public.verify_role_version(
      (auth.jwt() ->> 'role_id')::UUID, 
      (auth.jwt() ->> 'role_version')::INTEGER
    ) = true AND
    public.check_session_invalidation(auth.uid()) = false
  );
