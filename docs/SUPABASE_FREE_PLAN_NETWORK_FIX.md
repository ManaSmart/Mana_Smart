# Supabase Free Plan - Network Connection Fix

## 🚨 Problem

Error: `Network is unreachable` when trying to connect from GitHub Actions

```
pg_dump: error: connection to server at "db.xxxxx.supabase.co", port 5432 failed: Network is unreachable
```

## 🔍 Root Cause

**Supabase Free Plan Limitations:**
- External connections to the database are **blocked by default**
- IP whitelisting may not be available on free plan
- Direct database connections from external IPs are restricted

## ✅ Solutions

### Solution 1: Enable IP Whitelisting (If Available)

1. Go to: **Supabase Dashboard** → **Settings** → **Database**
2. Look for **Network Restrictions** or **Allowed IPs**
3. Add GitHub Actions IP ranges:
   - GitHub Actions uses dynamic IPs
   - You may need to allow all IPs: `0.0.0.0/0` (⚠️ Security risk for production)
   - Or use specific GitHub Actions IP ranges (if available)

**Note**: Free plan may not have this option. Check if the setting exists.

### Solution 2: Use Supabase Connection Pooling (Alternative)

If direct connection doesn't work, try using the **Session Mode** connection pooler:

**Change your `DATABASE_URL` secret to:**
```
postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**⚠️ Important**: This may not work with `pg_dump` as it requires direct connections. But worth trying.

### Solution 3: Use Supabase API Instead of pg_dump (Recommended for Free Plan)

Instead of using `pg_dump`, export the database via Supabase API using the JavaScript client. This works through the API endpoint, not direct database connection.

**Advantages:**
- ✅ Works with free plan (no IP restrictions)
- ✅ Uses existing Supabase API access
- ✅ No direct database connection needed

**Disadvantages:**
- ⚠️ Slower for large databases
- ⚠️ May not capture all database objects (functions, triggers, etc.)

### Solution 4: Upgrade to Pro Plan

Supabase Pro Plan ($25/month) includes:
- ✅ IP whitelisting
- ✅ Direct database connections
- ✅ Better connection limits
- ✅ More reliable for production backups

## 🔧 Implementation: Use API-Based Backup

Since direct `pg_dump` doesn't work on free plan, we'll use Supabase API to export data.

### Step 1: Update Workflow to Use API Export

The workflow will:
1. Use Supabase client to query all tables
2. Export data as SQL INSERT statements
3. Include schema information
4. Create a complete backup

### Step 2: Alternative - Use Supabase Dashboard Backup

Supabase Dashboard may have a built-in backup feature:
1. Go to: **Supabase Dashboard** → **Database** → **Backups**
2. Check if manual backup is available
3. Download backup file
4. Upload to S3 via workflow

## 📋 Current Workflow Status

The workflow is trying to use `pg_dump` which requires direct database access. For free plan, we need to either:

1. **Enable IP whitelisting** (if available)
2. **Use API-based export** (slower but works)
3. **Upgrade to Pro plan** (best for production)

## 🆘 Quick Fix: Test Connection Locally

Test if you can connect from your local machine:

```bash
psql "postgresql://postgres:yourpassword@db.rqssjgiunwyjeyutgkkp.supabase.co:5432/postgres"
```

If this works locally but not from GitHub Actions:
- ✅ Connection string is correct
- ❌ IP whitelisting is needed
- ❌ Free plan may not allow external connections

If this doesn't work locally either:
- ❌ Connection string may be incorrect
- ❌ Password may be wrong
- ❌ Database may be paused (free plan pauses after inactivity)

## 🔄 Next Steps

1. **Check Supabase Dashboard** for IP whitelisting option
2. **Test connection locally** to verify connection string
3. **Consider upgrading** to Pro plan for production use
4. **Use API-based export** as fallback (I'll update the workflow)

---

**Status**: Waiting for IP whitelisting configuration or plan upgrade

