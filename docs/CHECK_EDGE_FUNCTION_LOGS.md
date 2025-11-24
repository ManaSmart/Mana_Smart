# How to Check Edge Function Logs for Errors

## 🔍 Viewing Logs in Supabase Dashboard

### Step 1: Access Edge Functions

1. Go to: **Supabase Dashboard** → **Edge Functions**
2. Find **trigger-backup** in the list
3. Click on it to open details

### Step 2: View Logs

1. Click on **Logs** tab
2. Look for recent entries (last few minutes)
3. Check for error messages in red

### Step 3: Common Error Messages

**Missing GitHub Token:**
```
GITHUB_TOKEN is not set
Error: GitHub token not configured
```

**Missing Repository Info:**
```
GITHUB_OWNER or GITHUB_REPO is not set
Error: GitHub repository not configured
```

**GitHub API Errors:**
```
GitHub API error: {"message": "Bad credentials"}
GitHub API error: {"message": "Not Found"}
```

**Authentication Errors:**
```
User not found or invalid
Admin access required for backup operations
```

## 🔧 Quick Diagnostic

### Check if Secrets are Set

You can't directly check secrets from the UI, but you can:

1. **Check Function Logs** - Errors will show which secret is missing
2. **Test Function Manually** - Use the Supabase Dashboard to test
3. **Check GitHub Token** - Verify token is valid and has correct permissions

### Test GitHub Token

```bash
# Replace YOUR_TOKEN with your actual token
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Accept: application/vnd.github.v3+json" \
     https://api.github.com/user
```

Should return your GitHub user info, not 401/403.

### Test Workflow Access

```bash
# Replace with your values
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Accept: application/vnd.github.v3+json" \
     https://api.github.com/repos/YOUR_OWNER/YOUR_REPO/actions/workflows/backup.yml
```

Should return workflow info, not 404.

## 📋 Required Secrets Checklist

- [ ] `GITHUB_TOKEN` - GitHub Personal Access Token
- [ ] `GITHUB_OWNER` - Your GitHub username/org
- [ ] `GITHUB_REPO` - Repository name (e.g., `Mana_Smart_Scent`)
- [ ] `GITHUB_WORKFLOW_ID` - Workflow file name (default: `backup.yml`)

## 🆘 Still Getting 500 Error?

1. **Check Supabase Function Logs** (most important)
2. **Verify all secrets are set** in Supabase Dashboard
3. **Test GitHub token** using curl commands above
4. **Verify workflow file** exists at `.github/workflows/backup.yml`
5. **Check workflow has `workflow_dispatch`** trigger

---

**The logs will show the exact error!** Always check Supabase Edge Function logs first.

