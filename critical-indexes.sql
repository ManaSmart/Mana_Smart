-- Critical performance indexes for invoice queries
-- Run these in Supabase SQL Editor (one at a time)

-- 1. Index for created_at ordering (most important for performance)
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- 2. Index for invoice ID search
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_id ON invoices(invoice_id);

-- 3. Index for payment status filtering (very common)
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);

-- 4. Index for customer filtering
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);

-- 5. Composite index for customer + date queries (dashboard performance)
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date ON invoices(customer_id, created_at DESC);

-- 6. Partial index for unpaid invoices (common business query)
CREATE INDEX IF NOT EXISTS idx_invoices_unpaid ON invoices(customer_id, total_amount, paid_amount) 
WHERE payment_status IN ('draft', 'partial');

-- 7. Index for contract-based invoices
CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON invoices(contract_id) WHERE contract_id IS NOT NULL;
