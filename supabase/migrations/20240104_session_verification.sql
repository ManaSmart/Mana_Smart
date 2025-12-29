-- Database function for comprehensive session verification
CREATE OR REPLACE FUNCTION verify_user_session(
  p_user_id UUID,
  p_current_role_id UUID,
  p_current_role_version INTEGER
)
RETURNS TABLE (
  is_valid BOOLEAN,
  role_changed BOOLEAN,
  session_invalidated BOOLEAN,
  latest_user_data JSONB,
  verification_details TEXT
) AS $$
DECLARE
  user_record system_users%ROWTYPE;
  role_record roles%ROWTYPE;
  has_invalidation BOOLEAN;
  verification_msg TEXT := 'Session verified';
BEGIN
  -- Get current user data
  SELECT * INTO user_record
  FROM system_users
  WHERE user_id = p_user_id AND status = 'active';
  
  IF NOT FOUND THEN
    is_valid := FALSE;
    role_changed := FALSE;
    session_invalidated := FALSE;
    latest_user_data := NULL;
    verification_details := 'User not found or inactive';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Check for session invalidations
  SELECT EXISTS(
    SELECT 1 FROM session_invalidations 
    WHERE user_id = p_user_id 
    AND processed_at IS NULL 
    AND expires_at > NOW()
  ) INTO has_invalidation;
  
  IF has_invalidation THEN
    -- Mark invalidations as processed
    UPDATE session_invalidations 
    SET processed_at = NOW() 
    WHERE user_id = p_user_id 
    AND processed_at IS NULL;
    
    is_valid := FALSE;
    role_changed := FALSE;
    session_invalidated := TRUE;
    latest_user_data := NULL;
    verification_details := 'Session invalidated by administrator';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Check role changes if user has a role
  IF user_record.role_id IS NOT NULL THEN
    SELECT * INTO role_record
    FROM roles
    WHERE role_id = user_record.role_id AND is_active = true;
    
    IF NOT FOUND THEN
      -- User's role was deactivated or deleted
      is_valid := TRUE; -- User is still valid, but has no role
      role_changed := TRUE;
      session_invalidated := FALSE;
      latest_user_data := jsonb_build_object(
        'user_id', user_record.user_id,
        'email', user_record.email,
        'full_name', user_record.full_name,
        'role_id', NULL,
        'role_name', NULL,
        'role_permissions', NULL,
        'role_version', NULL,
        'has_valid_role', false
      );
      verification_details := 'User role deactivated';
      RETURN NEXT;
      RETURN;
    END IF;
    
    -- Check if role version changed (only if role_id is provided)
    IF p_current_role_id IS NOT NULL AND p_current_role_version IS NOT NULL THEN
      IF p_current_role_id != user_record.role_id OR p_current_role_version != role_record.role_version THEN
        is_valid := TRUE;
        role_changed := TRUE;
        session_invalidated := FALSE;
        latest_user_data := jsonb_build_object(
          'user_id', user_record.user_id,
          'email', user_record.email,
          'full_name', user_record.full_name,
          'role_id', role_record.role_id,
          'role_name', role_record.role_name,
          'role_permissions', role_record.permissions,
          'role_version', role_record.role_version,
          'has_valid_role', true,
          'role_assigned_at', user_record.role_assigned_at
        );
        verification_details := 'Role permissions updated';
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;
  END IF;
  
  -- Session is valid and no changes detected
  is_valid := TRUE;
  role_changed := FALSE;
  session_invalidated := FALSE;
  latest_user_data := NULL;
  verification_details := 'Session verified successfully';
  RETURN NEXT;
  
  -- Update last verification timestamp
  UPDATE system_users 
  SET last_verified_at = NOW() 
  WHERE user_id = p_user_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to force logout users with specific roles
CREATE OR REPLACE FUNCTION force_logout_role_users(
  p_role_id UUID,
  p_reason TEXT,
  p_created_by UUID
)
RETURNS INTEGER AS $$
DECLARE
  affected_users INTEGER;
BEGIN
  -- Create session invalidations for all users with the role
  INSERT INTO session_invalidations (user_id, reason, created_by)
  SELECT user_id, p_reason, p_created_by
  FROM system_users
  WHERE role_id = p_role_id AND status = 'active';
  
  GET DIAGNOSTICS affected_users = ROW_COUNT;
  
  -- Update their last verification to force re-verification
  UPDATE system_users 
  SET last_verified_at = NOW() - INTERVAL '1 hour'
  WHERE role_id = p_role_id AND status = 'active';
  
  RETURN affected_users;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to force logout specific user
CREATE OR REPLACE FUNCTION force_logout_user(
  p_target_user_id UUID,
  p_reason TEXT,
  p_created_by UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO session_invalidations (user_id, reason, created_by)
  VALUES (p_target_user_id, p_reason, p_created_by);
  
  UPDATE system_users 
  SET last_verified_at = NOW() - INTERVAL '1 hour'
  WHERE user_id = p_target_user_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION verify_user_session TO authenticated;
GRANT EXECUTE ON FUNCTION force_logout_role_users TO authenticated;
GRANT EXECUTE ON FUNCTION force_logout_user TO authenticated;
