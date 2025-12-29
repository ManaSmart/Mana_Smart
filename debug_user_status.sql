-- Check your user account status
SELECT 
    user_id,
    email,
    full_name,
    status,
    role_id,
    role_version,
    last_login,
    created_at
FROM system_users 
WHERE email = 'your-email@example.com'; -- Replace with your actual email
