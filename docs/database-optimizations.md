# Database Performance Optimization Guide

## Recommended Postgres Indexes

### 1. Invoices Table
```sql
-- Primary index for invoice lookups
CREATE INDEX CONCURRENTLY idx_invoices_customer_id ON invoices(customer_id);

-- Index for payment status filtering (very common)
CREATE INDEX CONCURRENTLY idx_invoices_payment_status ON invoices(payment_status);

-- Index for date-based queries (filtering by date ranges)
CREATE INDEX CONCURRENTLY idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX CONCURRENTLY idx_invoices_invoice_date ON invoices(invoice_date DESC);

-- Composite index for customer + date queries (common dashboard pattern)
CREATE INDEX CONCURRENTLY idx_invoices_customer_date ON invoices(customer_id, created_at DESC);

-- Index for contract-based invoices (monthly visits)
CREATE INDEX CONCURRENTLY idx_invoices_contract_id ON invoices(contract_id) WHERE contract_id IS NOT NULL;

-- Partial index for unpaid invoices (common query)
CREATE INDEX CONCURRENTLY idx_invoices_unpaid ON invoices(customer_id, total_amount, paid_amount) 
WHERE payment_status IN ('draft', 'partial');
```

### 2. Customers Table
```sql
-- Index for customer name searches
CREATE INDEX CONCURRENTLY idx_customers_name ON customers(customer_name);
CREATE INDEX CONCURRENTLY idx_customers_company ON customers(company);

-- Full-text search index for customer searches
CREATE INDEX CONCURRENTLY idx_customers_search ON customers 
USING gin(to_tsvector('english', customer_name || ' ' || COALESCE(company, '') || ' ' || COALESCE(contact_num, '')));

-- Index for status filtering
CREATE INDEX CONCURRENTLY idx_customers_status ON customers(status);
```

### 3. Inventory Table
```sql
-- Primary search indexes
CREATE INDEX CONCURRENTLY idx_inventory_product_name ON inventory(en_prod_name);
CREATE INDEX CONCURRENTLY idx_inventory_product_name_ar ON inventory(ar_prod_name);
CREATE INDEX CONCURRENTLY idx_inventory_product_code ON inventory(product_code);

-- Index for category filtering
CREATE INDEX CONCURRENTLY idx_inventory_category ON inventory(category);

-- Index for stock status queries
CREATE INDEX CONCURRENTLY idx_inventory_stock_status ON inventory(current_stock, minimum_stock_alert);

-- Composite index for low stock alerts
CREATE INDEX CONCURRENTLY idx_inventory_low_stock ON inventory(current_stock, minimum_stock_alert, en_prod_name) 
WHERE current_stock < minimum_stock_alert;

-- Full-text search index for product searches
CREATE INDEX CONCURRENTLY idx_inventory_search ON inventory 
USING gin(to_tsvector('english', en_prod_name || ' ' || COALESCE(ar_prod_name, '') || ' ' || product_code));
```

### 4. Payments Table
```sql
-- Index for invoice payment lookups
CREATE INDEX CONCURRENTLY idx_payments_invoice_id ON payments(invoice_id);

-- Index for date-based payment queries
CREATE INDEX CONCURRENTLY idx_payments_payment_date ON payments(payment_date DESC);

-- Composite index for payment analytics
CREATE INDEX CONCURRENTLY idx_payments_analytics ON payments(payment_date, paid_amount, payment_method);
```

### 5. Contracts Table
```sql
-- Index for customer contract lookups
CREATE INDEX CONCURRENTLY idx_contracts_customer_id ON contracts(customer_id);

-- Index for contract status filtering
CREATE INDEX CONCURRENTLY idx_contracts_status ON contracts(contract_status);

-- Index for date-based contract queries
CREATE INDEX CONCURRENTLY idx_contracts_dates ON contracts(contract_start_date, contract_end_date);
```

## Query Optimization Patterns

### 1. Use Specific SELECT Statements
**Before:**
```sql
SELECT * FROM invoices;
```

**After:**
```sql
SELECT 
  invoice_id, 
  customer_id, 
  invoice_date, 
  total_amount, 
  paid_amount, 
  payment_status,
  created_at
FROM invoices;
```

### 2. Server-Side Filtering
**Before (client-side):**
```javascript
// Fetch all invoices then filter in JavaScript
const allInvoices = await supabase.from('invoices').select('*');
const recentInvoices = allInvoices.filter(inv => 
  new Date(inv.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
);
```

**After (server-side):**
```javascript
// Let the database do the filtering
const recentInvoices = await supabase
  .from('invoices')
  .select('invoice_id, customer_id, total_amount, created_at')
  .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
```

### 3. Use Proper JOINs Instead of N+1 Queries
**Before (N+1 pattern):**
```javascript
// First, get all invoices
const invoices = await supabase.from('invoices').select('*');

// Then, for each invoice, get customer details
for (const invoice of invoices) {
  const customer = await supabase
    .from('customers')
    .select('*')
    .eq('customer_id', invoice.customer_id)
    .single();
  invoice.customer = customer;
}
```

**After (proper JOIN):**
```javascript
// Get invoices with customer data in one query
const invoices = await supabase
  .from('invoices')
  .select(`
    *,
    customer:customers(
      customer_name,
      contact_num,
      customer_address
    )
  `);
```

### 4. Implement Pagination Properly
**Before (fetch all):**
```javascript
const allInvoices = await supabase.from('invoices').select('*');
```

**After (paginated):**
```javascript
const page = 1;
const limit = 20;
const from = (page - 1) * limit;
const to = from + limit - 1;

const invoices = await supabase
  .from('invoices')
  .select('*', { count: 'exact' })
  .range(from, to)
  .order('created_at', { ascending: false });
```

## Performance Monitoring

### 1. Enable Query Logging
```sql
-- Log slow queries (takes effect after restart)
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries taking > 1 second
ALTER SYSTEM SET log_statement = 'all';
SELECT pg_reload_conf();
```

### 2. Monitor Index Usage
```sql
-- Check which indexes are being used
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find unused indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, tablename, indexname;
```

### 3. Analyze Query Performance
```sql
-- Use EXPLAIN ANALYZE for slow queries
EXPLAIN ANALYZE 
SELECT i.*, c.customer_name 
FROM invoices i 
JOIN customers c ON i.customer_id = c.customer_id 
WHERE i.payment_status = 'partial' 
ORDER BY i.created_at DESC 
LIMIT 20;
```

## Connection Pooling

### Supabase Configuration
- Use connection pooling in production
- Implement proper timeout handling
- Consider read replicas for read-heavy operations

### Application-Level Optimization
```javascript
// Implement request debouncing for search
const debouncedSearch = useMemo(
  () => debounce((term) => {
    setSearchTerm(term);
  }, 300),
  []
);

// Use React Query's built-in deduplication
const { data } = useQuery({
  queryKey: ['invoices', filters],
  queryFn: fetchInvoices,
  staleTime: 2 * 60 * 1000, // 2 minutes
});
```

## Caching Strategy

### 1. Application-Level Caching
- React Query handles component-level caching
- Implement service worker for offline support
- Use CDN for static assets

### 2. Database-Level Caching
```sql
-- Materialized view for common aggregations
CREATE MATERIALIZED VIEW invoice_summary AS
SELECT 
  customer_id,
  COUNT(*) as total_invoices,
  SUM(total_amount) as total_amount,
  SUM(paid_amount) as paid_amount,
  MAX(created_at) as last_invoice_date
FROM invoices 
GROUP BY customer_id;

-- Refresh materialized view periodically
CREATE OR REPLACE FUNCTION refresh_invoice_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY invoice_summary;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh (requires pg_cron extension)
SELECT cron.schedule('refresh-invoice-summary', '0 */6 * * *', 'SELECT refresh_invoice_summary();');
```

## Monitoring and Alerting

### Key Metrics to Monitor
1. **Query Response Time**: Keep under 200ms for common queries
2. **Database Connections**: Monitor connection pool usage
3. **Index Usage**: Ensure indexes are being used effectively
4. **Table Bloat**: Monitor and clean up table bloat
5. **Slow Queries**: Identify and optimize queries > 1 second

### Recommended Tools
- Supabase Dashboard (built-in monitoring)
- pg_stat_statements for query analysis
- External monitoring tools (DataDog, New Relic)

## Regular Maintenance

### 1. Weekly Tasks
```sql
-- Update table statistics
ANALYZE;

-- Check for bloat
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### 2. Monthly Tasks
- Review and optimize slow queries
- Check for unused indexes
- Update statistics on large tables
- Review materialized view refresh strategies

This optimization guide should significantly improve the performance of your invoice management system. Implement these changes gradually and monitor the impact on performance.
