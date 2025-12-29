-- Complete diagnostic for your login issue
-- Replace 'your-email@example.com' with your actual email

-- 1. Check user account
SELECT 'USER_STATUS' as check_type, 
       user_id, email, full_name, status, 
       CASE WHEN status = 'active' THEN 'OK' ELSE 'PROBLEM' END as status_check
FROM system_users 
WHERE email = 'your-email@example.com';

-- 2. Check role assignment
SELECT 'ROLE_ASSIGNMENT' as check_type,
       r.role_id, r.role_name, r.is_active, r.role_version,
       CASE WHEN r.is_active = true THEN 'OK' ELSE 'PROBLEM' END as role_check
FROM system_users su
LEFT JOIN roles r ON su.role_id = r.role_id
WHERE su.email = 'your-email@example.com';

-- 3. Check for session invalidations
SELECT 'SESSION_INVALIDATIONS' as check_type,
       COUNT(*) as invalidation_count,
       CASE WHEN COUNT(*) > 0 THEN 'PROBLEM' ELSE 'OK' END as session_check
FROM session_invalidations 
WHERE user_id = (SELECT user_id FROM system_users WHERE email = 'your-email@example.com')
AND processed_at IS NULL 
AND expires_at > NOW();

-- 4. Check if you have the required new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'system_users' 
AND table_schema = 'public'
ORDER BY ordinal_position;
