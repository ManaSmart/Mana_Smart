# How to Verify GitHub Secrets Are Set

## 🚨 Problem
Workflow is failing with:
```
✗ Missing Supabase credentials
SUPABASE_URL: MISSING
SUPABASE_SERVICE_ROLE_KEY: MISSING
```

This means the secrets are **not set** in GitHub or **not accessible** to the workflow.

## ✅ Solution: Verify and Set Secrets

### Step 1: Check if Secrets Are Set

1. Go to your GitHub repository
2. Click **Settings** (top menu)
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. Check if these secrets exist:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DB_URL`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_S3_REGION`
   - `AWS_S3_BUCKET`
   - `SUPABASE_BUCKETS_TO_BACKUP`

### Step 2: Add Missing Secrets

If any secrets are missing:

1. Click **New repository secret**
2. Enter the **Name** (exactly as shown above, case-sensitive)
3. Enter the **Secret** value
4. Click **Add secret**

### Step 3: Get the Secret Values

#### SUPABASE_URL
1. Go to: https://app.supabase.com
2. Select your project
3. Go to: **Settings** → **API**
4. Copy **Project URL** (looks like: `https://xxxxx.supabase.co`)

#### SUPABASE_SERVICE_ROLE_KEY
1. Same page as above (Settings → API)
2. Find **service_role** key (⚠️ Keep this secret!)
3. Click **Reveal** and copy the key
4. It starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

#### SUPABASE_DB_URL
1. Go to: **Settings** → **Database**
2. Under **Connection Info**, find **Direct connection** (Port 5432)
3. Select **URI** format
4. Copy the connection string
5. Replace `[YOUR-PASSWORD]` with your database password
6. Format: `postgresql://postgres:yourpassword@db.xxxxx.supabase.co:5432/postgres`

**⚠️ CRITICAL**: Must use **direct connection** (port 5432), NOT pooled connection (port 6543)

#### AWS Credentials
- Get from AWS IAM console
- Create IAM user with S3 read/write permissions
- Generate access keys

#### SUPABASE_BUCKETS_TO_BACKUP
- Comma-separated list of bucket names
- Example: `profile-pictures,contracts,inventory,employees,branding,payroll,assets,custody`
- No spaces, or spaces will be trimmed automatically

### Step 4: Verify Secret Names Are Correct

**Common Mistakes:**
- ❌ `SUPABASE_URL` (wrong) vs ✅ `SUPABASE_URL` (correct)
- ❌ `supabase_url` (wrong - lowercase) vs ✅ `SUPABASE_URL` (correct - uppercase)
- ❌ `SUPABASE_SERVICE_KEY` (wrong) vs ✅ `SUPABASE_SERVICE_ROLE_KEY` (correct)

**All secret names must match EXACTLY** (case-sensitive).

### Step 5: Test the Workflow

After setting all secrets:

1. Go to: **Actions** → **Backup Database and Storage**
2. Click **Run workflow**
3. Check the "Debug environment variables" step
4. It should show all variables as "SET (hidden)"

## 🔍 Debugging

### Check Workflow Logs

1. Go to: **Actions** → Click on the failed workflow run
2. Expand the **"Debug environment variables"** step
3. Check which variables are MISSING

### Common Issues

#### Issue 1: Secrets Not Set
**Symptom**: All variables show as MISSING
**Solution**: Add all secrets in GitHub Settings

#### Issue 2: Wrong Secret Names
**Symptom**: Some variables MISSING, others SET
**Solution**: Check secret names match exactly (case-sensitive)

#### Issue 3: Secrets Set But Not Accessible
**Symptom**: Variables show as MISSING even though secrets exist
**Solution**: 
- Check if workflow has permission to read secrets
- Verify you're looking at the correct repository
- Try re-running the workflow

#### Issue 4: Workflow Branch Protection
**Symptom**: Secrets not accessible on certain branches
**Solution**: 
- Check branch protection rules
- Ensure workflow has permission to read secrets
- Run workflow on main/master branch first

## 📋 Quick Checklist

- [ ] All 8 secrets are added in GitHub Settings
- [ ] Secret names match exactly (case-sensitive)
- [ ] `SUPABASE_URL` is the full URL (starts with `https://`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is the service_role key (not anon key)
- [ ] `SUPABASE_DB_URL` uses direct connection (port 5432)
- [ ] Workflow has permission to read secrets
- [ ] Debug step shows all variables as "SET (hidden)"

## 🆘 Still Having Issues?

1. **Check the debug step output** - It will tell you exactly which secrets are missing
2. **Verify secret names** - They must match exactly (case-sensitive)
3. **Check repository settings** - Ensure Actions are enabled
4. **Try manual trigger** - Run workflow manually to see full logs

---

**Note**: The workflow now includes a debug step that will automatically check and report which secrets are missing, making it easier to identify the problem.

