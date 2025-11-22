-- Quick Fix: Update leads_status_check constraint
-- Run this in Supabase SQL Editor

-- Drop existing constraint
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new constraint with all status values
ALTER TABLE leads
ADD CONSTRAINT leads_status_check 
CHECK (
    status IS NULL OR 
    status IN ('new', 'contacted', 'quoted', 'follow_up', 'negotiating', 'won', 'lost')
);

-- Verify it works
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'leads_status_check';

