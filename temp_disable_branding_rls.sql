-- Temporarily disable RLS for company_branding to test upload
ALTER TABLE company_branding DISABLE ROW LEVEL SECURITY;

-- Try your logo upload now
-- If it works, we know the issue is with RLS policies
-- If it still fails, the issue is elsewhere
