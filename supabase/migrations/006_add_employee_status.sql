-- Migration: Add status column to employees table
-- This migration adds a status field to track employee status (active, on-leave, terminated)

-- Add status column to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'on-leave', 'terminated'));

-- Update existing records to have 'active' status if they don't have one
UPDATE employees
SET status = 'active'
WHERE status IS NULL;

-- Make status NOT NULL after setting defaults
ALTER TABLE employees
ALTER COLUMN status SET NOT NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

