-- Migration: Add created_by and updated_by audit columns to track user actions
-- This migration adds user tracking columns to tables used in the history log

-- Add created_by and updated_by to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES system_users(user_id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Add created_by and updated_by to contracts table
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES system_users(user_id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Add created_by and updated_by to invoices table
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES system_users(user_id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Add created_by to payments table (payments typically don't get updated, only created)
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES system_users(user_id);

-- Add created_by and updated_by to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES system_users(user_id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Add created_by and updated_by to monthly_visits table
ALTER TABLE monthly_visits
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES system_users(user_id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Add created_by and updated_by to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES system_users(user_id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Add updated_by to payrolls table (it already has created_by)
ALTER TABLE payrolls
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES system_users(user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON customers(created_by);
CREATE INDEX IF NOT EXISTS idx_customers_updated_by ON customers(updated_by);
CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON contracts(created_by);
CREATE INDEX IF NOT EXISTS idx_contracts_updated_by ON contracts(updated_by);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_updated_by ON invoices(updated_by);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_updated_by ON leads(updated_by);
CREATE INDEX IF NOT EXISTS idx_monthly_visits_created_by ON monthly_visits(created_by);
CREATE INDEX IF NOT EXISTS idx_monthly_visits_updated_by ON monthly_visits(updated_by);
CREATE INDEX IF NOT EXISTS idx_employees_created_by ON employees(created_by);
CREATE INDEX IF NOT EXISTS idx_employees_updated_by ON employees(updated_by);
CREATE INDEX IF NOT EXISTS idx_payrolls_updated_by ON payrolls(updated_by);

-- Add comments for documentation
COMMENT ON COLUMN customers.created_by IS 'User ID who created this customer record';
COMMENT ON COLUMN customers.updated_by IS 'User ID who last updated this customer record';
COMMENT ON COLUMN contracts.created_by IS 'User ID who created this contract';
COMMENT ON COLUMN contracts.updated_by IS 'User ID who last updated this contract';
COMMENT ON COLUMN invoices.created_by IS 'User ID who created this invoice';
COMMENT ON COLUMN invoices.updated_by IS 'User ID who last updated this invoice';
COMMENT ON COLUMN payments.created_by IS 'User ID who created this payment record';
COMMENT ON COLUMN leads.created_by IS 'User ID who created this lead';
COMMENT ON COLUMN leads.updated_by IS 'User ID who last updated this lead';
COMMENT ON COLUMN monthly_visits.created_by IS 'User ID who created this visit record';
COMMENT ON COLUMN monthly_visits.updated_by IS 'User ID who last updated this visit record';
COMMENT ON COLUMN employees.created_by IS 'User ID who created this employee record';
COMMENT ON COLUMN employees.updated_by IS 'User ID who last updated this employee record';
COMMENT ON COLUMN payrolls.updated_by IS 'User ID who last updated this payroll record';

