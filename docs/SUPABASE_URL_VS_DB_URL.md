# Understanding SUPABASE_URL vs SUPABASE_DB_URL

## ⚠️ Common Confusion

Many users confuse these two different URLs. They serve different purposes:

## 🔗 SUPABASE_URL (API URL)

**Purpose**: Used by Supabase JavaScript client to make API calls

**Format**: 
```
https://rqssjgiunwyjeyutgkkp.supabase.co
```

**Where to find it**:
1. Go to: Supabase Dashboard → Settings → API
2. Find **Project URL**
3. Copy the URL (starts with `https://`)

**Used for**:
- Creating Supabase client: `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)`
- Making API calls to Supabase
- Accessing Edge Functions
- Storage operations
- Database queries via Supabase client

**GitHub Secret Name**: `VITE_SUPABASE_URL` (or `SUPABASE_URL`)

## 🗄️ SUPABASE_DB_URL (Database Connection String)

**Purpose**: Used by `pg_dump` to directly connect to PostgreSQL

**Format**:
```
postgresql://postgres:yourpassword@db.rqssjgiunwyjeyutgkkp.supabase.co:5432/postgres
```

**Where to find it**:
1. Go to: Supabase Dashboard → Settings → Database
2. Under **Connection Info**, find **Direct connection** (Port 5432)
3. Select **URI** format
4. Copy the connection string
5. Replace `[YOUR-PASSWORD]` with your actual database password

**Used for**:
- `pg_dump` command to export database
- Direct PostgreSQL connections
- Database administration tools

**GitHub Secret Name**: `SUPABASE_DB_URL`

## ❌ Common Mistakes

### Mistake 1: Using Database URL for Supabase Client

**Wrong**:
```javascript
// ❌ This will fail!
const supabase = createClient(
  'postgresql://postgres:pass@db.xxxxx.supabase.co:5432/postgres',
  serviceKey
);
// Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
```

**Correct**:
```javascript
// ✅ This works!
const supabase = createClient(
  'https://xxxxx.supabase.co',  // API URL
  serviceKey
);
```

### Mistake 2: Using API URL for pg_dump

**Wrong**:
```bash
# ❌ This will fail!
pg_dump "https://xxxxx.supabase.co"
# Error: connection to server failed
```

**Correct**:
```bash
# ✅ This works!
pg_dump "postgresql://postgres:pass@db.xxxxx.supabase.co:5432/postgres"
```

## 📋 Quick Reference

| Purpose | Secret Name | Format | Example |
|---------|------------|--------|---------|
| **Supabase Client** | `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | `https://rqssjgiunwyjeyutgkkp.supabase.co` |
| **pg_dump** | `SUPABASE_DB_URL` | `postgresql://postgres:pass@db.xxxxx.supabase.co:5432/postgres` | `postgresql://postgres:mypass@db.rqssjgiunwyjeyutgkkp.supabase.co:5432/postgres` |

## ✅ Correct GitHub Secrets Setup

### Secret 1: VITE_SUPABASE_URL
- **Value**: `https://rqssjgiunwyjeyutgkkp.supabase.co`
- **Used by**: All Node.js scripts that create Supabase client
- **Must start with**: `http://` or `https://`

### Secret 2: SUPABASE_DB_URL
- **Value**: `postgresql://postgres:yourpassword@db.rqssjgiunwyjeyutgkkp.supabase.co:5432/postgres`
- **Used by**: `pg_dump` command
- **Must start with**: `postgresql://`
- **Must use**: Direct connection (port 5432), NOT pooled (port 6543)

## 🔍 How to Verify

### Check VITE_SUPABASE_URL
```bash
# Should start with https://
echo $VITE_SUPABASE_URL
# Output: https://rqssjgiunwyjeyutgkkp.supabase.co
```

### Check SUPABASE_DB_URL
```bash
# Should start with postgresql://
echo $SUPABASE_DB_URL | cut -d'@' -f1
# Output: postgresql://postgres:password
```

## 🐛 Troubleshooting

### Error: "Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL"

**Cause**: You're using the database connection string instead of the API URL

**Solution**: 
1. Check your `VITE_SUPABASE_URL` secret
2. It should be: `https://xxxxx.supabase.co`
3. NOT: `postgresql://postgres:...`

### Error: "connection to server failed" (pg_dump)

**Cause**: You're using the API URL instead of the database connection string

**Solution**:
1. Check your `SUPABASE_DB_URL` secret
2. It should be: `postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres`
3. NOT: `https://xxxxx.supabase.co`

---

**Remember**: 
- **API URL** (https://) → For Supabase JavaScript client
- **DB URL** (postgresql://) → For pg_dump and direct PostgreSQL connections

