-- Row Level Security (RLS) policies for secure RBAC
-- Enable RLS on all relevant tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_change_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_invalidations ENABLE ROW LEVEL SECURITY;

-- Roles table policies
-- Only users with 'settings' update permission can manage roles
CREATE POLICY "Users can view active roles" ON roles
  FOR SELECT
  USING (
    is_active = true AND
    auth.jwt() ->> 'has_valid_role' = 'true'
  );

CREATE POLICY "Super admins can view all roles" ON roles
  FOR SELECT
  USING (
    auth.jwt() ->> 'permissions' = '"all"'
  );

CREATE POLICY "Users with settings permission can manage roles" ON roles
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

-- System users table policies
-- Users can view their own profile and others based on permissions
CREATE POLICY "Users can view own profile" ON system_users
  FOR SELECT
  USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users with employees permission can view users" ON system_users
  FOR SELECT
  USING (
    auth.jwt() ->> 'has_valid_role' = 'true' AND
    (
      auth.jwt() ->> 'permissions' = '"all"' OR
      (auth.jwt() -> 'permissions' ? 'employees' AND auth.jwt() -> 'permissions' -> 'employees' ? 'read')
    )
  );

CREATE POLICY "Super admins can manage all users" ON system_users
  FOR ALL
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

-- Role change audit policies (read-only for auditors)
CREATE POLICY "Users can view own role changes" ON role_change_audit
  FOR SELECT
  USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users with settings permission can view role audit" ON role_change_audit
  FOR SELECT
  USING (
    auth.jwt() ->> 'has_valid_role' = 'true' AND
    (
      auth.jwt() ->> 'permissions' = '"all"' OR
      (auth.jwt() -> 'permissions' ? 'settings' AND auth.jwt() -> 'permissions' -> 'settings' ? 'read')
    )
  );

-- Session invalidations policies
CREATE POLICY "System can manage session invalidations" ON session_invalidations
  FOR ALL
  USING (
    auth.jwt() ->> 'has_valid_role' = 'true' AND
    public.verify_role_version(
      (auth.jwt() ->> 'role_id')::UUID, 
      (auth.jwt() ->> 'role_version')::INTEGER
    ) = true
  );

CREATE POLICY "Users can check own session invalidations" ON session_invalidations
  FOR SELECT
  USING (
    user_id = auth.uid()
  );

-- Function-based policy for dynamic permission checking
CREATE OR REPLACE FUNCTION public.check_table_permission(table_name TEXT, required_action TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_permissions JSONB;
BEGIN
  user_permissions := auth.jwt() -> 'permissions';
  
  -- Super admin has all permissions
  IF user_permissions = '"all"'::jsonb THEN
    RETURN true;
  END IF;
  
  -- Check specific table permission
  IF user_permissions ? table_name AND user_permissions -> table_name ? required_action THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example of using function-based policy for a specific table (e.g., inventory)
-- This would be added to each table's policies
/*
CREATE POLICY "Inventory permissions" ON inventory
  FOR ALL
  USING (
    public.check_table_permission('inventory', 'read')
  )
  WITH CHECK (
    public.check_table_permission('inventory', 'create')
  );
*/
