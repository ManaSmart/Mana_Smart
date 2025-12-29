-- Add missing updated_by column to system_users
ALTER TABLE system_users 
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Then run your fix script again
-- Your fix_login.sql should now work
