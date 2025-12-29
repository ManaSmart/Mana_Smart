-- Check what's in your current JWT claims
SELECT 
    auth.uid() as user_id,
    auth.email() as email,
    auth.jwt() ->> 'role_id' as role_id,
    auth.jwt() ->> 'role_name' as role_name,
    auth.jwt() ->> 'role_version' as role_version,
    auth.jwt() ->> 'has_valid_role' as has_valid_role,
    auth.jwt() ->> 'permissions' as permissions,
    auth.jwt() ->> 'email' as jwt_email;

-- Check your user record
SELECT 
    user_id,
    email,
    status,
    role_id,
    role_version,
    last_verified_at
FROM system_users 
WHERE email = 'ziad-mana@gmail.com';
