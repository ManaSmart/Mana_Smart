-- Secure role update function with audit trail
CREATE OR REPLACE FUNCTION update_user_role_secure(
  p_target_user_id UUID,
  p_new_role_id UUID,
  p_updated_by UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  old_role_id UUID;
  old_role_version INTEGER;
  new_role_version INTEGER;
  user_exists BOOLEAN;
BEGIN
  -- Check if user exists and is active
  SELECT EXISTS(
    SELECT 1 FROM system_users 
    WHERE user_id = p_target_user_id AND status = 'active'
  ) INTO user_exists;
  
  IF NOT user_exists THEN
    RAISE EXCEPTION 'User not found or inactive';
  END IF;
  
  -- Get current role information
  SELECT role_id, role_version INTO old_role_id, old_role_version
  FROM system_users
  WHERE user_id = p_target_user_id;
  
  -- Get new role version if role is being assigned
  IF p_new_role_id IS NOT NULL THEN
    SELECT role_version INTO new_role_version
    FROM roles
    WHERE role_id = p_new_role_id AND is_active = true;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'New role not found or inactive';
    END IF;
  END IF;
  
  -- Update user role
  UPDATE system_users
  SET 
    role_id = p_new_role_id,
    role_version = new_role_version,
    role_assigned_at = CASE 
      WHEN p_new_role_id IS NOT NULL AND p_new_role_id IS DISTINCT FROM old_role_id 
      THEN NOW() 
      ELSE role_assigned_at 
    END,
    updated_at = NOW()
  WHERE user_id = p_target_user_id;
  
  -- Log the change
  INSERT INTO role_change_audit (
    user_id, 
    old_role_id, 
    new_role_id, 
    old_role_version, 
    new_role_version,
    change_type,
    changed_by,
    change_reason
  ) VALUES (
    p_target_user_id,
    old_role_id,
    p_new_role_id,
    old_role_version,
    new_role_version,
    CASE 
      WHEN p_new_role_id IS NULL THEN 'revoke'
      WHEN old_role_id IS NULL THEN 'assign'
      ELSE 'assign'
    END,
    p_updated_by,
    p_reason
  );
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user permissions with verification
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  role_id UUID,
  role_name TEXT,
  role_version INTEGER,
  permissions JSONB,
  is_active BOOLEAN,
  last_verified TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    su.user_id,
    su.role_id,
    r.role_name,
    su.role_version,
    r.permissions,
    su.status = 'active' as is_active,
    su.last_verified_at as last_verified
  FROM system_users su
  LEFT JOIN roles r ON su.role_id = r.role_id
  WHERE su.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_area TEXT,
  p_action TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  user_permissions JSONB;
BEGIN
  -- Get user's role permissions
  SELECT r.permissions INTO user_permissions
  FROM system_users su
  JOIN roles r ON su.role_id = r.role_id
  WHERE su.user_id = p_user_id 
  AND su.status = 'active'
  AND r.is_active = true;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Super admin has all permissions
  IF user_permissions = '"all"'::jsonb THEN
    RETURN TRUE;
  END IF;
  
  -- Check specific permission
  RETURN user_permissions ? p_area AND 
         (user_permissions -> p_area) @> to_jsonb(p_action);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all active users for a role
CREATE OR REPLACE FUNCTION get_role_users(p_role_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role_assigned_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    su.user_id,
    su.email,
    su.full_name,
    su.role_assigned_at,
    su.last_login
  FROM system_users su
  WHERE su.role_id = p_role_id 
  AND su.status = 'active'
  ORDER BY su.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_user_role_secure TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_permissions TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_permission TO authenticated;
GRANT EXECUTE ON FUNCTION get_role_users TO authenticated;
