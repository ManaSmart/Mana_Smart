# Deploy export-database Edge Function

## Overview

The `export-database` Edge Function exports database data via Supabase API, bypassing IP restrictions. This works with Supabase Free Plan.

## Deployment Steps

### Step 1: Deploy the Function

```bash
supabase functions deploy export-database --no-verify-jwt
```

**Why `--no-verify-jwt`?**
- The function uses custom authentication (user_id verification)
- Not Supabase's built-in JWT auth

### Step 2: Set Required Secrets

The function needs these secrets (if not already set):

```bash
# These should already be set from other functions
supabase secrets set SUPABASE_URL=https://rqssjgiunwyjeyutgkkp.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set DATABASE_URL=postgresql://postgres:password@db.rqssjgiunwyjeyutgkkp.supabase.co:5432/postgres
```

### Step 3: Update Table List (Important!)

The function uses a hardcoded list of tables. **You must update this list** to match your actual database tables.

**Edit**: `supabase/functions/export-database/index.ts`

**Find**: The `allPossibleTables` array (around line 50)

**Update**: Add all your table names:

```typescript
const allPossibleTables = [
  'system_users',
  'roles',
  'employees',
  'customers',
  // ... add all your tables here
];
```

**To get your table list:**
1. Go to Supabase Dashboard → Table Editor
2. List all your tables
3. Add them to the array

### Step 4: Test the Function

```bash
# Test locally (if you have Supabase CLI set up)
supabase functions serve export-database

# Or test via curl
curl -X POST https://rqssjgiunwyjeyutgkkp.supabase.co/functions/v1/export-database \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "your-user-id"}'
```

## How It Works

1. **Workflow calls Edge Function** when pg_dump fails
2. **Edge Function queries tables** via Supabase API (no IP restrictions)
3. **Generates SQL INSERT statements** for all data
4. **Returns base64-encoded SQL** to workflow
5. **Workflow decodes and saves** to backup file

## Limitations

- ✅ **Works with Free Plan** (no IP restrictions)
- ✅ **Exports all data** (INSERT statements)
- ⚠️ **No schema export** (no CREATE TABLE, functions, triggers)
- ⚠️ **Slower than pg_dump** (API calls vs direct connection)
- ⚠️ **Requires table list** (must be updated manually)

## Advantages

- ✅ Bypasses IP whitelisting requirements
- ✅ Works with Supabase Free Plan
- ✅ Uses Supabase infrastructure (no external connections)
- ✅ Secure (requires authentication)

## Workflow Integration

The workflow automatically uses this function when:
1. `pg_dump` fails with "Network is unreachable"
2. Direct database connection is blocked
3. Free plan restrictions prevent external connections

**No manual intervention needed** - the workflow handles it automatically.

---

**Status**: Ready to deploy. Update table list first!

