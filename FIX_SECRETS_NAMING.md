# Fix Secrets Naming Issues

## Issues Found

### In Supabase:
- ❌ `BACKUP_GITHUB_TOKEN` → Should be `GITHUB_TOKEN`
- ❌ `BACKUP_GITHUB_OWNER` → Should be `GITHUB_OWNER`
- ❌ `BACKUP_GITHUB_REPO` → Should be `GITHUB_REPO`
- ❌ `SUPABASE_ANON_KEY` → Not needed in Edge Functions (can delete)
- ❌ `VITE_SUPABASE_SERVICE_ROLE_KEY` → Not needed in Edge Functions (can delete)
- ❌ `VITE_SUPABASE_URL` → Not needed in Edge Functions (can delete)
- ❌ `SUPABASE_DB_URL` → Not needed in Edge Functions (can delete)

### In GitHub:
- ❌ `BACKUP_GITHUB_OWNER` → Should be `GITHUB_OWNER`
- ❌ `BACKUP_GITHUB_REPO` → Should be `GITHUB_REPO`
- ❌ `VITE_SUPABASE_SERVICE_ROLE_KEY` → Not needed in GitHub Actions (can delete)
- ❌ `VITE_SUPABASE_URL` → Not needed in GitHub Actions (can delete)

## Step-by-Step Fix

### Step 1: Fix Supabase Secrets

You need to get the actual values from your current secrets. Since Supabase hides the values, you'll need to:

1. **Get the values from GitHub Secrets** (they're the same):
   - Go to GitHub → Your Repo → Settings → Secrets and variables → Actions
   - Copy the values for:
     - `BACKUP_GITHUB_TOKEN` (this will become `GITHUB_TOKEN` in Supabase)
     - `BACKUP_GITHUB_OWNER` (this will become `GITHUB_OWNER` in Supabase)
     - `BACKUP_GITHUB_REPO` (this will become `GITHUB_REPO` in Supabase)

2. **Set the correct names in Supabase:**

```powershell
# Replace the values with your actual values from GitHub Secrets
supabase secrets set GITHUB_TOKEN=your_token_from_BACKUP_GITHUB_TOKEN --project-ref rqssjgiunwyjeyutgkkp
supabase secrets set GITHUB_OWNER=your_owner_from_BACKUP_GITHUB_OWNER --project-ref rqssjgiunwyjeyutgkkp
supabase secrets set GITHUB_REPO=your_repo_from_BACKUP_GITHUB_REPO --project-ref rqssjgiunwyjeyutgkkp
```

3. **Delete the old incorrectly named secrets:**

```powershell
supabase secrets unset BACKUP_GITHUB_TOKEN --project-ref rqssjgiunwyjeyutgkkp
supabase secrets unset BACKUP_GITHUB_OWNER --project-ref rqssjgiunwyjeyutgkkp
supabase secrets unset BACKUP_GITHUB_REPO --project-ref rqssjgiunwyjeyutgkkp
```

4. **Delete unnecessary secrets (optional cleanup):**

```powershell
supabase secrets unset SUPABASE_ANON_KEY --project-ref rqssjgiunwyjeyutgkkp
supabase secrets unset VITE_SUPABASE_SERVICE_ROLE_KEY --project-ref rqssjgiunwyjeyutgkkp
supabase secrets unset VITE_SUPABASE_URL --project-ref rqssjgiunwyjeyutgkkp
supabase secrets unset SUPABASE_DB_URL --project-ref rqssjgiunwyjeyutgkkp
```

### Step 2: Fix GitHub Secrets

1. **Go to GitHub → Your Repo → Settings → Secrets and variables → Actions**

2. **Rename secrets:**
   - Click on `BACKUP_GITHUB_OWNER` → Edit → Change name to `GITHUB_OWNER` → Update secret
   - Click on `BACKUP_GITHUB_REPO` → Edit → Change name to `GITHUB_REPO` → Update secret

3. **Delete unnecessary secrets:**
   - Delete `VITE_SUPABASE_SERVICE_ROLE_KEY` (not needed in GitHub Actions)
   - Delete `VITE_SUPABASE_URL` (not needed in GitHub Actions)

**Note:** `BACKUP_GITHUB_TOKEN` in GitHub is correct (GitHub doesn't allow `GITHUB_` prefix), so leave it as is.

### Step 3: Verify

**Check Supabase secrets:**
```powershell
supabase secrets list --project-ref rqssjgiunwyjeyutgkkp
```

You should see:
- ✅ `GITHUB_TOKEN` (not `BACKUP_GITHUB_TOKEN`)
- ✅ `GITHUB_OWNER` (not `BACKUP_GITHUB_OWNER`)
- ✅ `GITHUB_REPO` (not `BACKUP_GITHUB_REPO`)
- ✅ `GITHUB_WORKFLOW_ID`
- ✅ `BACKUP_API_KEY`
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `AWS_ACCESS_KEY_ID`
- ✅ `AWS_SECRET_ACCESS_KEY`
- ✅ `AWS_S3_REGION`
- ✅ `AWS_S3_BUCKET`

**Check GitHub Secrets:**
- ✅ `GITHUB_OWNER` (not `BACKUP_GITHUB_OWNER`)
- ✅ `GITHUB_REPO` (not `BACKUP_GITHUB_REPO`)
- ✅ `BACKUP_GITHUB_TOKEN` (this is correct - GitHub doesn't allow `GITHUB_` prefix)

### Step 4: Redeploy Edge Functions

After fixing secrets, redeploy your functions:

```powershell
supabase functions deploy trigger-backup --no-verify-jwt --project-ref rqssjgiunwyjeyutgkkp
supabase functions deploy backup-status --no-verify-jwt --project-ref rqssjgiunwyjeyutgkkp
supabase functions deploy settings-toggle --no-verify-jwt --project-ref rqssjgiunwyjeyutgkkp
supabase functions deploy backup-history --no-verify-jwt --project-ref rqssjgiunwyjeyutgkkp
supabase functions deploy generate-signed-url --no-verify-jwt --project-ref rqssjgiunwyjeyutgkkp
```

## Quick Reference: What Should Be Where

### Supabase Edge Function Secrets:
- `GITHUB_TOKEN` (value from GitHub's `BACKUP_GITHUB_TOKEN`)
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_WORKFLOW_ID`
- `BACKUP_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_REGION`
- `AWS_S3_BUCKET`

### GitHub Secrets:
- `BACKUP_GITHUB_TOKEN` (GitHub doesn't allow `GITHUB_` prefix)
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `BACKUP_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_REGION`
- `AWS_S3_BUCKET`
- `SUPABASE_BUCKETS_TO_BACKUP`

