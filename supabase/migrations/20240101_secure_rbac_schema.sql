-- Enhanced roles table with versioning and audit trail
-- First, add new columns to existing roles table if they don't exist
DO $$ 
BEGIN
    -- Check if table exists and add new columns if needed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles') THEN
        -- Add new columns if they don't exist
        ALTER TABLE roles ADD COLUMN IF NOT EXISTS role_version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES system_users(user_id);
        ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);
        
        -- Update existing rows to have default values
        UPDATE roles SET role_version = 1 WHERE role_version IS NULL;
        UPDATE roles SET is_active = true WHERE is_active IS NULL;
    ELSE
        -- Create table if it doesn't exist
        CREATE TABLE roles (
            role_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            role_name TEXT NOT NULL UNIQUE,
            permissions JSONB NOT NULL DEFAULT '{}',
            role_version INTEGER NOT NULL DEFAULT 1,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_by UUID REFERENCES system_users(user_id),
            updated_by UUID REFERENCES system_users(user_id),
            
            -- Constraints
            CONSTRAINT valid_permissions CHECK (
                jsonb_typeof(permissions) = 'object' OR 
                (jsonb_typeof(permissions) = 'string' AND permissions::text = '"all"')
            ),
            CONSTRAINT positive_version CHECK (role_version > 0)
        );
    END IF;
END $$;

-- Enhanced system_users table with role version tracking
ALTER TABLE system_users 
ADD COLUMN IF NOT EXISTS role_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS role_assigned_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS session_token_hash TEXT,
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Role change audit log
CREATE TABLE IF NOT EXISTS role_change_audit (
  audit_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES system_users(user_id),
  old_role_id UUID REFERENCES roles(role_id),
  new_role_id UUID REFERENCES roles(role_id),
  old_role_version INTEGER,
  new_role_version INTEGER,
  change_type TEXT NOT NULL CHECK (change_type IN ('assign', 'revoke', 'update', 'disable', 'enable')),
  changed_by UUID NOT NULL REFERENCES system_users(user_id),
  change_reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Session invalidation tokens for forced logout
CREATE TABLE IF NOT EXISTS session_invalidations (
  invalidation_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES system_users(user_id),
  reason TEXT NOT NULL,
  created_by UUID REFERENCES system_users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Indexes for performance
CREATE INDEX idx_system_users_role_id ON system_users(role_id);
CREATE INDEX idx_system_users_role_version ON system_users(role_id, role_version);
CREATE INDEX idx_role_change_audit_user_id ON role_change_audit(user_id);
CREATE INDEX idx_role_change_audit_changed_at ON role_change_audit(changed_at);
CREATE INDEX idx_session_invalidations_user_id ON session_invalidations(user_id);
CREATE INDEX idx_session_invalidations_expires_at ON session_invalidations(expires_at);

-- Function to update role version when permissions change
CREATE OR REPLACE FUNCTION increment_role_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.role_version = OLD.role_version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-increment role version on permission changes (only if is_active column exists)
DO $$
BEGIN
    -- Check if is_active column exists before creating trigger
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'roles' AND column_name = 'is_active'
    ) THEN
        -- Drop trigger if it exists to avoid conflicts
        DROP TRIGGER IF EXISTS role_version_increment ON roles;
        
        CREATE TRIGGER role_version_increment
          BEFORE UPDATE OF permissions, is_active ON roles
          FOR EACH ROW
          WHEN (OLD.permissions IS DISTINCT FROM NEW.permissions OR OLD.is_active IS DISTINCT FROM NEW.is_active)
          EXECUTE FUNCTION increment_role_version();
    ELSE
        -- Create trigger without is_active check
        DROP TRIGGER IF EXISTS role_version_increment ON roles;
        
        CREATE TRIGGER role_version_increment
          BEFORE UPDATE OF permissions ON roles
          FOR EACH ROW
          WHEN (OLD.permissions IS DISTINCT FROM NEW.permissions)
          EXECUTE FUNCTION increment_role_version();
    END IF;
END $$;

-- Function to log role changes
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

-- Trigger to log role changes
CREATE TRIGGER role_change_audit_trigger
  AFTER UPDATE OF role_id, role_version ON system_users
  FOR EACH ROW
  EXECUTE FUNCTION log_role_change();
