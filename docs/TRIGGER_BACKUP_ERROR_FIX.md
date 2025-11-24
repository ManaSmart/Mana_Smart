# Trigger Backup 500 Error - Fix Guide

## 🚨 Error

```
POST https://rqssjgiunwyjeyutgkkp.supabase.co/functions/v1/trigger-backup 500 (Internal Server Error)
```

## 🔍 Common Causes

### 1. Missing GitHub Secrets (Most Common)

The `trigger-backup` function requires these secrets to be set in Supabase:

- `GITHUB_TOKEN` - GitHub Personal Access Token with workflow permissions
- `GITHUB_OWNER` - GitHub username or organization name
- `GITHUB_REPO` - Repository name
- `GITHUB_WORKFLOW_ID` - Workflow file name (default: `backup.yml`)

### 2. Invalid GitHub Token

The token may be:
- Expired
- Missing required permissions
- Revoked

### 3. Workflow File Not Found

The workflow file may:
- Not exist at `.github/workflows/backup.yml`
- Not be configured for `workflow_dispatch`
- Be in a different branch

### 4. GitHub API Errors

- Network connectivity issues
- GitHub API rate limiting
- Repository access issues

## ✅ Fix Steps

### Step 1: Check Supabase Edge Function Secrets

1. Go to: **Supabase Dashboard** → **Edge Functions** → **Secrets**
2. Verify these secrets are set:
   - `GITHUB_TOKEN`
   - `GITHUB_OWNER`
   - `GITHUB_REPO`
   - `GITHUB_WORKFLOW_ID` (optional, defaults to `backup.yml`)

### Step 2: Create/Verify GitHub Token

1. Go to: **GitHub** → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token (classic)**
3. Set expiration (recommended: 90 days or custom)
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Click **Generate token**
6. Copy the token immediately (you won't see it again)

### Step 3: Set Secrets in Supabase

```bash
# Using Supabase CLI
supabase secrets set GITHUB_TOKEN=your_github_token_here
supabase secrets set GITHUB_OWNER=your_username_or_org
supabase secrets set GITHUB_REPO=your_repo_name
supabase secrets set GITHUB_WORKFLOW_ID=backup.yml
```

**Or via Supabase Dashboard:**
1. Go to: **Supabase Dashboard** → **Edge Functions** → **Secrets**
2. Add each secret:
   - Key: `GITHUB_TOKEN`, Value: `your_token`
   - Key: `GITHUB_OWNER`, Value: `your_username`
   - Key: `GITHUB_REPO`, Value: `Mana_Smart_Scent` (or your repo name)
   - Key: `GITHUB_WORKFLOW_ID`, Value: `backup.yml`

### Step 4: Verify Workflow File Exists

Check that `.github/workflows/backup.yml` exists and has:

```yaml
on:
  workflow_dispatch:  # ✅ This is required for manual triggers
    inputs:
      dispatch_id:
        description: 'Dispatch ID for tracking'
        required: false
      trigger_type:
        description: 'Type of trigger'
        required: false
```

### Step 5: Test GitHub API Access

Test if the token works:

```bash
curl -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
     -H "Accept: application/vnd.github.v3+json" \
     https://api.github.com/repos/YOUR_OWNER/YOUR_REPO/actions/workflows/backup.yml
```

Should return workflow information, not 404 or 401.

### Step 6: Check Function Logs

1. Go to: **Supabase Dashboard** → **Edge Functions** → **trigger-backup** → **Logs**
2. Look for error messages that indicate:
   - Missing environment variables
   - GitHub API errors
   - Authentication failures

## 🔧 Quick Diagnostic

Run this in Supabase SQL Editor to check if secrets are set:

```sql
-- Note: You can't directly query Edge Function secrets from SQL
-- But you can check if backup_history table is accessible
SELECT COUNT(*) FROM backup_history;
```

## 📋 Expected Values

Based on your repository, these should be:

- `GITHUB_OWNER`: Your GitHub username or organization
- `GITHUB_REPO`: `Mana_Smart_Scent` (or the actual repo name)
- `GITHUB_WORKFLOW_ID`: `backup.yml`
- `GITHUB_TOKEN`: A valid GitHub Personal Access Token

## 🆘 Still Getting 500 Error?

1. **Check Supabase Function Logs** for detailed error messages
2. **Verify GitHub Token Permissions** - must have `repo` and `workflow` scopes
3. **Test GitHub API Directly** using curl (see Step 5)
4. **Verify Workflow File** exists and has `workflow_dispatch` trigger
5. **Check Repository Access** - token must have access to the repository

## 🔄 After Fixing

1. **Redeploy the function** (if you made code changes):
   ```bash
   supabase functions deploy trigger-backup
   ```

2. **Test again** from the UI:
   - Go to Settings → Backup tab
   - Click "Backup Now"
   - Should see success message

---

**Most Common Issue**: Missing `GITHUB_TOKEN` secret in Supabase Edge Functions.

