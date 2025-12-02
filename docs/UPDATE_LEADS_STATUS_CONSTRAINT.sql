-- Update leads_status_check constraint to include all status values
-- Run this in Supabase SQL Editor

-- Step 1: Check current constraint definition
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'leads_status_check'
AND conrelid = 'leads'::regclass;

-- Step 2: Drop the existing constraint (if it exists)
ALTER TABLE leads 
DROP CONSTRAINT IF EXISTS leads_status_check;

-- Step 3: Create new constraint with all allowed status values
ALTER TABLE leads
ADD CONSTRAINT leads_status_check 
CHECK (
    status IS NULL OR 
    status IN (
        'new',
        'contacted',
        'quoted',
        'follow_up',
        'negotiating',
        'won',
        'lost'
    )
);

-- Step 4: Verify the constraint was created
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'leads_status_check'
AND conrelid = 'leads'::regclass;

-- Step 5: Test the constraint (optional - uncomment to test)
-- This should succeed:
-- INSERT INTO leads (company_name, contact_person, status) 
-- VALUES ('Test Company', 'Test Person', 'new');

-- This should fail:
-- INSERT INTO leads (company_name, contact_person, status) 
-- VALUES ('Test Company', 'Test Person', 'invalid_status');

