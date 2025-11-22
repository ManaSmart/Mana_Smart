# How to Add Secrets - Step by Step Guide

This guide shows you exactly how to add all the required secrets for the backup system.

## Part 1: Add GitHub Secrets

GitHub Secrets are used by GitHub Actions workflows to access your services.

### Steps:

1. **Go to your GitHub repository**
   - Navigate to: `https://github.com/ManaSmart/Mana_Smart_Scent`
   - Make sure you're logged in with the account that has access to this repository

2. **Open Secrets Settings**
   - Click on **Settings** (top menu of your repository)
   - In the left sidebar, click **Secrets and variables**
   - Click **Actions**

3. **Add Each Secret**
   - Click **New repository secret** button
   - For each secret below, enter the **Name** and **Value**, then click **Add secret**

### Required GitHub Secrets:

| Secret Name | How to Get the Value |
|------------|---------------------|
| `SUPABASE_URL` | Go to Supabase Dashboard → Your Project → Settings → API → Copy "Project URL" |
| `SUPABASE_SERVICE_ROLE_KEY` | Go to Supabase Dashboard → Your Project → Settings → API → Copy "service_role" key (⚠️ Keep this secret!) |
| `DATABASE_URL` | Go to Supabase Dashboard → Your Project → Settings → Database → Connection string → Select "URI" → Replace `[YOUR-PASSWORD]` with your actual database password |
| `AWS_ACCESS_KEY_ID` | From your AWS account → IAM → Users → Your user → Security credentials → Access keys |
| `AWS_SECRET_ACCESS_KEY` | Same as above (shown only once when created) |
| `AWS_S3_REGION` | Your S3 bucket region (e.g., `us-east-1`, `eu-west-1`) |
| `AWS_S3_BUCKET` | Your S3 bucket name (e.g., `my-backup-bucket`) |
| `SUPABASE_BUCKETS_TO_BACKUP` | Comma-separated list of bucket names: `profile-pictures,contracts,inventory,employees,branding,payroll,assets,custody` |
| `BACKUP_GITHUB_TOKEN` | See instructions below ⬇️ (⚠️ Note: Must NOT start with `GITHUB_`) |
| `GITHUB_OWNER` | Your GitHub username or organization name (e.g., `ManaSmart`) |
| `GITHUB_REPO` | Your repository name (e.g., `Mana_Smart_Scent`) |
| `BACKUP_API_KEY` | Generate using: `openssl rand -hex 32` (or use any secure random string) |

### Creating GitHub Personal Access Token (BACKUP_GITHUB_TOKEN):

1. Go to: https://github.com/settings/tokens
2. Click **Generate new token** → **Generate new token (classic)**
3. Give it a name: `Backup System Token`
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. **Expiration setting**:
   - **Recommended**: Select **No expiration** or **1 year**
   - **Why**: Backups run automatically 24/7. If the token expires, backups will fail silently and you may lose data
   - **Security**: The token is stored securely in GitHub Secrets and only accessible by GitHub Actions, so the risk is minimal
   - **Alternative**: If you prefer shorter expiration (30-90 days), set a calendar reminder to renew it before expiration
6. Click **Generate token**
7. **Copy the token immediately** (you won't see it again!)
8. Add it as `BACKUP_GITHUB_TOKEN` secret in GitHub (⚠️ Important: GitHub doesn't allow secret names starting with `GITHUB_`, so use `BACKUP_GITHUB_TOKEN` instead)

---

## Part 2: Add Supabase Edge Function Secrets

Supabase Edge Function secrets are used by your Edge Functions to communicate with GitHub and AWS.

### Prerequisites:

- Install Supabase CLI: `npm install -g supabase`
- Login to Supabase: `supabase login`
- Link your project: `supabase link --project-ref your-project-ref`

### Steps:

Open PowerShell/Terminal in your project directory and run these commands:

```powershell
# Set Supabase secrets
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Set GitHub secrets
# Note: In Supabase secrets, we use GITHUB_TOKEN (Supabase doesn't have the GITHUB_ restriction)
# The same token value you used for BACKUP_GITHUB_TOKEN in GitHub Secrets
supabase secrets set GITHUB_TOKEN=your_github_token
supabase secrets set GITHUB_OWNER=ManaSmart
supabase secrets set GITHUB_REPO=Mana_Smart_Scent
supabase secrets set GITHUB_WORKFLOW_ID=backup.yml

# Set AWS secrets
supabase secrets set AWS_ACCESS_KEY_ID=your_aws_access_key
supabase secrets set AWS_SECRET_ACCESS_KEY=your_aws_secret_key
supabase secrets set AWS_S3_REGION=us-east-1
supabase secrets set AWS_S3_BUCKET=your_bucket_name

# Set backup API key (same value as VITE_BACKUP_API_KEY in frontend)
supabase secrets set BACKUP_API_KEY=your_backup_api_key
```

**Replace the placeholder values with your actual values!**

### Example (with real values):

```powershell
supabase secrets set SUPABASE_URL=https://abcdefgh.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
supabase secrets set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
supabase secrets set GITHUB_OWNER=ManaSmart
supabase secrets set GITHUB_REPO=Mana_Smart_Scent
supabase secrets set GITHUB_WORKFLOW_ID=backup.yml
supabase secrets set AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
supabase secrets set AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
supabase secrets set AWS_S3_REGION=us-east-1
supabase secrets set AWS_S3_BUCKET=mana-smart-backups
supabase secrets set BACKUP_API_KEY=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
```

---

## Part 3: Add Frontend Environment Variables

Create a `.env.local` file in your project root (this file is already in `.gitignore`):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_BACKUP_API_KEY=your_secure_random_string_here
```

**Important:** `VITE_BACKUP_API_KEY` must be the **same value** as `BACKUP_API_KEY` in GitHub Secrets and Supabase Secrets.

---

## Quick Checklist

- [ ] All 12 GitHub Secrets added
- [ ] All 10 Supabase Edge Function secrets set
- [ ] Frontend `.env.local` file created with 3 variables
- [ ] `BACKUP_API_KEY` is the same value in all 3 places
- [ ] GitHub Personal Access Token created with `repo` and `workflow` scopes
- [ ] AWS S3 bucket created and accessible
- [ ] Supabase CLI installed and logged in

---

## Verification

### Verify GitHub Secrets:
- Go to: `https://github.com/ManaSmart/Mana_Smart_Scent/settings/secrets/actions`
- You should see all 12 secrets listed

### Verify Supabase Secrets:
```powershell
supabase secrets list
```

### Verify Frontend Variables:
- Check that `.env.local` exists in project root
- Restart your dev server after creating/updating `.env.local`

---

## Troubleshooting

**"Secret not found" errors:**
- Double-check secret names (case-sensitive!)
- Make sure you're in the correct repository/project
- Verify you have the right permissions

**"Authentication failed" errors:**
- Verify GitHub token has correct scopes
- Check AWS credentials are valid
- Ensure Supabase service role key is correct

**"Repository not found" errors:**
- Verify `GITHUB_OWNER` and `GITHUB_REPO` match your actual repository
- Check you have access to the repository with your GitHub token

