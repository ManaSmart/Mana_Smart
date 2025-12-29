-- Simple user check - replace with your actual email
SELECT 
    email,
    full_name,
    status,
    role_id,
    role_version,
    last_login,
    CASE 
        WHEN status = 'active' THEN 'USER OK'
        ELSE 'USER INACTIVE - FIX NEEDED'
    END as user_status
FROM system_users 
WHERE email = 'your-email@example.com';
