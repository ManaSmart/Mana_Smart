# Supabase Free Plan - Backup Configuration Guide

## ⚠️ Important Notes for Free Plan

Supabase Free Plan has some limitations that affect backups:

1. **Connection Limits**: Limited concurrent connections
2. **IP Restrictions**: May require IP whitelisting for external connections
3. **Direct Connection Required**: Must use direct connection (port 5432), not pooled (port 6543)

## 🔧 Configuration Steps

### Step 1: Get Direct Connection String

1. Go to: **Supabase Dashboard** → **Settings** → **Database**
2. Under **Connection Info**, find **Direct connection** (Port 5432)
3. Select **URI** format
4. Copy the connection string
5. Replace `[YOUR-PASSWORD]` with your actual database password

**Format:**
```
postgresql://postgres:yourpassword@db.xxxxx.supabase.co:5432/postgres
```

**⚠️ CRITICAL**: 
- ✅ Use port **5432** (direct connection)
- ❌ Do NOT use port **6543** (pooled connection)
- ❌ Do NOT use `.pooler.supabase.com` URLs

### Step 2: Configure IP Whitelisting (If Required)

If `pg_dump` fails with connection errors:

1. Go to: **Supabase Dashboard** → **Settings** → **Database**
2. Scroll to **Connection Pooling** section
3. Find **Allowed IP addresses** or **Network Restrictions**
4. Add GitHub Actions IP ranges (or use `0.0.0.0/0` for testing - not recommended for production)

**GitHub Actions IP Ranges:**
- GitHub Actions uses dynamic IPs
- For free plan, you may need to allow all IPs temporarily: `0.0.0.0/0`
- **Security Note**: This allows connections from anywhere. For production, consider:
  - Using Supabase Pro plan with better IP controls
  - Using a self-hosted runner with fixed IP
  - Using Supabase Edge Functions instead of direct pg_dump

### Step 3: Set GitHub Secrets

In GitHub → Settings → Secrets and variables → Actions:

| Secret Name | Value | Notes |
|------------|-------|-------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Your project URL |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | Service role key (not anon) |
| `SUPABASE_DB_URL` | `postgresql://postgres:pass@db.xxxxx.supabase.co:5432/postgres` | **Direct connection only** |

### Step 4: Verify Connection String Format

**✅ CORRECT Format:**
```
postgresql://postgres:yourpassword@db.xxxxx.supabase.co:5432/postgres
```

**❌ WRONG Formats:**
```
# Pooled connection (won't work with pg_dump)
postgresql://postgres:password@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

# Missing password
postgresql://postgres@db.xxxxx.supabase.co:5432/postgres

# Wrong port
postgresql://postgres:password@db.xxxxx.supabase.co:6543/postgres
```

## 🐛 Troubleshooting

### Error: "connection to server on socket failed"

**Cause**: `pg_dump` is trying to connect locally instead of using the connection string.

**Solution**: 
1. Verify `SUPABASE_DB_URL` secret is set correctly
2. Check the connection string format (must start with `postgresql://`)
3. Ensure password is URL-encoded if it contains special characters

### Error: "connection refused" or "timeout"

**Cause**: IP not whitelisted or using wrong connection type.

**Solutions**:
1. **Whitelist IPs**: Add GitHub Actions IPs to Supabase allowed list
2. **Use Direct Connection**: Ensure using port 5432, not 6543
3. **Check Firewall**: Supabase free plan may block external connections

### Error: "password authentication failed"

**Cause**: Wrong password in connection string.

**Solution**:
1. Reset database password in Supabase Dashboard
2. Update `SUPABASE_DB_URL` secret with new password
3. Ensure password doesn't contain unencoded special characters

### Error: "too many connections"

**Cause**: Free plan connection limit reached.

**Solutions**:
1. Wait a few minutes and retry
2. Upgrade to Pro plan for more connections
3. Use connection pooling (but note: pg_dump requires direct connection)

## 🔄 Alternative: Use Supabase Edge Function for Backup

If direct `pg_dump` doesn't work on free plan, consider:

1. **Use Supabase Edge Function** to export data via API
2. **Use Supabase Dashboard** backup feature (if available)
3. **Upgrade to Pro Plan** for better connection options

## 📋 Checklist

- [ ] Using direct connection (port 5432)
- [ ] Connection string format is correct
- [ ] Password is URL-encoded if needed
- [ ] IP whitelisting configured (if required)
- [ ] `SUPABASE_DB_URL` secret is set in GitHub
- [ ] Connection string doesn't contain `.pooler.supabase.com`
- [ ] Connection string doesn't use port 6543

## 🆘 Still Having Issues?

1. **Test connection locally**:
   ```bash
   psql "postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres"
   ```

2. **Check Supabase logs**: Dashboard → Logs → Database

3. **Verify secret format**: No quotes, no spaces, full connection string

4. **Contact Supabase Support**: Free plan may have specific limitations

---

**Note**: The workflow now includes better error messages to help identify connection issues.

