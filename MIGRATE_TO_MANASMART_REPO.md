# Migrate to ManaSmart Repository

This guide will help you:
1. Remove/transfer your old `ab1div` repository
2. Update all secrets to use `ManaSmart/Mana_Smart`
3. Verify the backup system is configured correctly

## Current Setup

- **Current Remote:** `ManaSmart/Mana_Smart` ✅ (already correct)
- **Old Repo:** `ab1div/[repo-name]` (needs to be removed/transferred)

## Step 1: Remove/Transfer Old Repository

### Option A: Transfer Repository (Recommended)

If you want to keep the history and issues:

1. Go to your old repository: `https://github.com/ab1div/[repo-name]`
2. Click **Settings** (top right)
3. Scroll down to **"Danger Zone"**
4. Click **"Transfer ownership"**
5. Enter: `ManaSmart` as the new owner
6. Type the repository name to confirm
7. Click **"I understand, transfer this repository"**

**Note:** You need to be an owner/admin of the ManaSmart organization to transfer to it.

### Option B: Delete Repository

If you don't need the old repository:

1. Go to your old repository: `https://github.com/ab1div/[repo-name]`
2. Click **Settings** (top right)
3. Scroll down to **"Danger Zone"**
4. Click **"Delete this repository"**
5. Type the repository name to confirm
6. Click **"I understand the consequences, delete this repository"**

## Step 2: Update Supabase Secrets

Update your Supabase Edge Function secrets to use the correct repository:

```powershell
# Set correct repository information
supabase secrets set GITHUB_OWNER=ManaSmart --project-ref rqssjgiunwyjeyutgkkp
supabase secrets set GITHUB_REPO=Mana_Smart --project-ref rqssjgiunwyjeyutgkkp
supabase secrets set GITHUB_WORKFLOW_ID=backup.yml --project-ref rqssjgiunwyjeyutgkkp
```

**Important:** Make sure `GITHUB_TOKEN` is set with a token that has access to the `ManaSmart` organization.

## Step 3: Update GitHub Secrets

Go to: **GitHub → ManaSmart/Mana_Smart → Settings → Secrets and variables → Actions**

Verify/Update these secrets:
- ✅ `GITHUB_OWNER` = `ManaSmart` (or `BACKUP_GITHUB_OWNER` if GitHub doesn't allow `GITHUB_` prefix)
- ✅ `GITHUB_REPO` = `Mana_Smart` (or `BACKUP_GITHUB_REPO` if GitHub doesn't allow `GITHUB_` prefix)
- ✅ `BACKUP_GITHUB_TOKEN` = Your GitHub Personal Access Token (with `repo` and `workflow` permissions for ManaSmart org)

## Step 4: Verify Workflow File is in Correct Repo

Make sure the workflow file exists in `ManaSmart/Mana_Smart`:

```powershell
# Check if workflow file exists locally
Test-Path .github\workflows\backup.yml

# If it exists, make sure it's committed and pushed
git add .github/workflows/backup.yml
git commit -m "Ensure backup workflow is in ManaSmart repo"
git push origin main
```

## Step 5: Verify GitHub Token Permissions

Your GitHub Personal Access Token needs:
- ✅ `repo` scope (full control of private repositories)
- ✅ `workflow` scope (update GitHub Action workflows)
- ✅ Access to the `ManaSmart` organization

To check/update:
1. Go to: https://github.com/settings/tokens
2. Find your token (or create a new one)
3. Make sure it has `repo` and `workflow` scopes
4. If using an organization, make sure the token has access to `ManaSmart` org

## Step 6: Test the Backup System

After updating secrets, test the trigger-backup function:

```powershell
curl.exe -X POST https://rqssjgiunwyjeyutgkkp.supabase.co/functions/v1/trigger-backup `
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" `
  -H "Content-Type: application/json"
```

**Expected response:**
```json
{
  "dispatch_id": "abc-123-def",
  "status_url": "/functions/v1/backup-status?dispatch_id=abc-123-def",
  "message": "Backup workflow triggered successfully"
}
```

If you get a 404 error, check:
- ✅ `GITHUB_OWNER` = `ManaSmart` (exact match, case-sensitive)
- ✅ `GITHUB_REPO` = `Mana_Smart` (exact match, case-sensitive)
- ✅ `GITHUB_WORKFLOW_ID` = `backup.yml` (exact filename)
- ✅ Workflow file exists at `.github/workflows/backup.yml` in the repo
- ✅ GitHub token has access to the ManaSmart organization

## Step 7: Clean Up Old Repository References

After everything is working:

1. **Remove old repository from your account** (if you deleted it, it's already gone)
2. **Update any documentation** that references the old repo
3. **Check for any other services** (Vercel, Netlify, etc.) that might be connected to the old repo

## Verification Checklist

- [ ] Old `ab1div` repository is deleted or transferred
- [ ] Supabase secrets updated: `GITHUB_OWNER=ManaSmart`, `GITHUB_REPO=Mana_Smart`
- [ ] GitHub Secrets updated in `ManaSmart/Mana_Smart` repo
- [ ] Workflow file exists at `.github/workflows/backup.yml` in `ManaSmart/Mana_Smart`
- [ ] Workflow file is committed and pushed to GitHub
- [ ] GitHub token has `repo` and `workflow` permissions
- [ ] GitHub token has access to `ManaSmart` organization
- [ ] Test trigger-backup function returns success (not 404)

## Troubleshooting

### "Not Found" (404) Error

**Cause:** GitHub can't find the workflow file.

**Solutions:**
1. Verify `GITHUB_OWNER` = `ManaSmart` (exact case)
2. Verify `GITHUB_REPO` = `Mana_Smart` (exact case, with underscore)
3. Verify `GITHUB_WORKFLOW_ID` = `backup.yml` (exact filename)
4. Make sure workflow file is pushed to GitHub: `git push origin main`
5. Check the workflow file exists in GitHub: Go to `ManaSmart/Mana_Smart` → Actions tab → You should see the workflow

### "Resource not accessible by personal access token" (403)

**Cause:** GitHub token doesn't have the right permissions or access.

**Solutions:**
1. Regenerate GitHub token with `repo` and `workflow` scopes
2. Make sure token has access to `ManaSmart` organization
3. Update `GITHUB_TOKEN` secret in Supabase with new token

### Workflow Not Showing in GitHub Actions

**Cause:** Workflow file might not be in the correct location or format.

**Solutions:**
1. Verify file is at `.github/workflows/backup.yml` (not `.github/workflow/` or `.github/workflows/backup.yaml`)
2. Check YAML syntax is valid
3. Make sure file is committed and pushed: `git add .github/workflows/backup.yml && git commit -m "Add workflow" && git push`

