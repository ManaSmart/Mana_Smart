-- Temporarily disable RLS for system_users to allow login
ALTER TABLE system_users DISABLE ROW LEVEL SECURITY;

-- After you can login, we can re-enable with proper policies:
-- ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
