-- Custom JWT claims function for Supabase
-- This adds role information to JWT tokens during authentication
-- Note: In Supabase, you need to create this in the public schema and configure it in auth settings
CREATE OR REPLACE FUNCTION public.custom_jwt_claims(user_id UUID)
RETURNS JSONB AS $$
DECLARE
  user_record system_users%ROWTYPE;
  role_record roles%ROWTYPE;
  claims JSONB;
BEGIN
  -- Get user and role information
  SELECT * INTO user_record 
  FROM system_users 
  WHERE user_id = public.custom_jwt_claims.user_id 
  AND status = 'active';
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get role information if user has a role
  IF user_record.role_id IS NOT NULL THEN
    SELECT * INTO role_record
    FROM roles
    WHERE role_id = user_record.role_id
    AND is_active = true;
    
    IF NOT FOUND THEN
      -- User has inactive/invalid role
      RETURN jsonb_build_object(
        'user_id', user_record.user_id,
        'email', user_record.email,
        'role_id', NULL,
        'role_version', NULL,
        'has_valid_role', false
      );
    END IF;
    
    claims := jsonb_build_object(
      'user_id', user_record.user_id,
      'email', user_record.email,
      'role_id', role_record.role_id,
      'role_name', role_record.role_name,
      'role_version', role_record.role_version,
      'permissions', role_record.permissions,
      'has_valid_role', true,
      'role_assigned_at', user_record.role_assigned_at
    );
  ELSE
    -- User has no role assigned
    claims := jsonb_build_object(
      'user_id', user_record.user_id,
      'email', user_record.email,
      'role_id', NULL,
      'role_version', NULL,
      'has_valid_role', false
    );
  END IF;
  
  RETURN claims;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify role version on each request
CREATE OR REPLACE FUNCTION public.verify_role_version(current_role_id UUID, current_role_version INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  latest_role_version INTEGER;
  role_is_active BOOLEAN;
BEGIN
  -- Check if role exists and get latest version
  SELECT role_version, is_active INTO latest_role_version, role_is_active
  FROM roles
  WHERE role_id = current_role_id;
  
  -- Return false if role doesn't exist or is inactive
  IF NOT FOUND OR NOT role_is_active THEN
    RETURN FALSE;
  END IF;
  
  -- Return true if versions match, false if role has been updated
  RETURN current_role_version = latest_role_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for session invalidations
CREATE OR REPLACE FUNCTION public.check_session_invalidation(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_invalidation BOOLEAN;
BEGIN
  -- Check if there are any unprocessed session invalidations
  SELECT EXISTS(
    SELECT 1 FROM session_invalidations 
    WHERE user_id = public.check_session_invalidation.user_id 
    AND processed_at IS NULL 
    AND expires_at > NOW()
  ) INTO has_invalidation;
  
  RETURN has_invalidation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create session invalidation
CREATE OR REPLACE FUNCTION public.invalidate_user_sessions(
  target_user_id UUID, 
  reason TEXT,
  created_by UUID
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO session_invalidations (user_id, reason, created_by)
  VALUES (target_user_id, reason, created_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.custom_jwt_claims TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_role_version TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_session_invalidation TO authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_user_sessions TO authenticated;
