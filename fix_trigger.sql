-- Update the log_role_change function to handle NULL change_type
CREATE OR REPLACE FUNCTION log_role_change()
RETURNS TRIGGER AS $$
DECLARE
  change_type_val TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role_id IS NULL AND NEW.role_id IS NOT NULL THEN
      change_type_val := 'assign';
    ELSIF OLD.role_id IS NOT NULL AND NEW.role_id IS NULL THEN
      change_type_val := 'revoke';
    ELSIF OLD.role_id != NEW.role_id THEN
      change_type_val := 'assign';
    ELSIF OLD.role_id = NEW.role_id AND OLD.role_version != NEW.role_version THEN
      change_type_val := 'update';
    END IF;
    
    -- Only log if we have a valid change type
    IF change_type_val IS NOT NULL THEN
      INSERT INTO role_change_audit (
        user_id, old_role_id, new_role_id, 
        old_role_version, new_role_version,
        change_type, changed_by
      ) VALUES (
        NEW.user_id, OLD.role_id, NEW.role_id,
        OLD.role_version, NEW.role_version,
        change_type_val, NEW.updated_by
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
