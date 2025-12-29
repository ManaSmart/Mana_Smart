-- Fix common login issues - replace with your actual email
-- 1. Ensure user is active
UPDATE system_users 
SET status = 'active' 
WHERE email = 'ziad-mana@gmail.com';

-- 2. Ensure role version is set
UPDATE system_users 
SET role_version = COALESCE(role_version, 1),
    role_assigned_at = COALESCE(role_assigned_at, NOW()),
    last_verified_at = NOW()
WHERE email = 'ziad-mana@gmail.com';

-- 3. Ensure role is active (if you have a role)
UPDATE roles 
SET is_active = true 
WHERE role_id = (SELECT role_id FROM system_users WHERE email = 'ziad-mana@gmail.com')
AND role_id IS NOT NULL;

-- 4. Clear any session invalidations
UPDATE session_invalidations 
SET processed_at = NOW() 
WHERE user_id = (SELECT user_id FROM system_users WHERE email = 'ziad-mana@gmail.com')
AND processed_at IS NULL;

-- 5. Check result
SELECT 
    email,
    status,
    role_id,
    role_version,
    CASE WHEN status = 'active' THEN 'SHOULD WORK NOW' ELSE 'STILL INACTIVE' END as result
FROM system_users 
WHERE email = 'ziad-mana@gmail.com';
