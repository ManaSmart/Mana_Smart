-- Check your role status
SELECT 
    r.role_id,
    r.role_name,
    r.is_active,
    r.role_version,
    r.permissions,
    su.email as user_email
FROM roles r
JOIN system_users su ON r.role_id = su.role_id
WHERE su.email = 'your-email@example.com'; -- Replace with your actual email
