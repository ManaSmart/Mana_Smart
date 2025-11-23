# Backup System Setup Guide

This document provides comprehensive instructions for setting up the production-ready backup system for your Supabase-connected dashboard.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Setup Instructions](#setup-instructions)
5. [Environment Variables](#environment-variables)
6. [GitHub Secrets Configuration](#github-secrets-configuration)
7. [Supabase Edge Functions Setup](#supabase-edge-functions-setup)
8. [Frontend Integration](#frontend-integration)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)
11. [Security Checklist](#security-checklist)
12. [Alternative Deployment Options](#alternative-deployment-options)

## Overview

The backup system provides:
- **Automatic daily backups** via GitHub Actions cron schedule
- **Manual backup triggers** from the React frontend
- **Complete data backup** including:
  - PostgreSQL database (schema + data + functions + RLS policies)
  - Supabase Storage files (configurable buckets)
  - Auth users (exported to JSON)
- **Secure S3 storage** with pre-signed download URLs
- **Backup history tracking** with status and error reporting

## Architecture

```
┌─────────────┐
│   React UI  │───► Edge Functions ───► GitHub Actions ───► AWS S3
│  (Settings) │         (Control)          (Backup Runner)
└─────────────┘
```

1. **Frontend (React)**: `BackupSettings.tsx` component in Settings page
2. **Edge Functions**: Control layer for triggering and status checking
3. **GitHub Actions**: Executes backup workflow (pg_dump, storage download, zip, S3 upload)
4. **AWS S3**: Stores backup archives
5. **Supabase**: Stores backup configuration and history

## Prerequisites

- Supabase project with database and storage configured
- AWS S3 bucket for storing backups
- GitHub repository with Actions enabled
- Node.js 20+ and npm installed locally
- Supabase CLI installed (`npm install -g supabase`)

## Setup Instructions

### Step 1: Run Database Migration

Run the SQL migration to create the backup tables:

```bash
# Using Supabase CLI
supabase db push

# Or manually execute the migration file:
# supabase/migrations/007_create_backup_system.sql
```

This creates:
- `system_settings_kv` table for backup configuration
- `backup_history` table for tracking backup operations

### Step 2: Configure Environment Variables

#### Frontend (.env or .env.local)

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_BACKUP_API_KEY=your_secure_random_string_here
```

Generate a secure API key:
```bash
openssl rand -hex 32
```

### Step 3: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

| Secret Name | Description | Example |
|------------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (from Supabase Dashboard) | `eyJhbGc...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres` |
| `AWS_ACCESS_KEY_ID` | AWS access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_S3_REGION` | AWS S3 region | `us-east-1` |
| `AWS_S3_BUCKET` | S3 bucket name | `my-backup-bucket` |
| `SUPABASE_BUCKETS_TO_BACKUP` | Comma-separated bucket names | `profile-pictures,contracts,inventory,employees,branding,payroll,assets,custody` |
| `BACKUP_GITHUB_TOKEN` | Personal Access Token (repo + workflow permissions) | `ghp_xxxxx` |
| `GITHUB_OWNER` | GitHub username or organization | `your-username` |
| `GITHUB_REPO` | Repository name | `your-repo-name` |
| `BACKUP_API_KEY` | Same value as `VITE_BACKUP_API_KEY` | `your_secure_random_string` |

#### Getting Supabase Service Role Key

1. Go to Supabase Dashboard → Your Project → Settings → API
2. Copy the "service_role" key (keep this secret!)

#### Getting DATABASE_URL

1. Go to Supabase Dashboard → Your Project → Settings → Database
2. Under "Connection string", select "URI" and copy the connection string
3. Replace `[YOUR-PASSWORD]` with your database password

#### Creating GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with scopes:
   - `repo` (full control)
   - `workflow` (update GitHub Action workflows)
3. **Expiration**: 
   - **Recommended**: Set to **No expiration** or **1 year** for production backup systems
   - **Why**: Backups run automatically and will fail if the token expires, potentially causing data loss
   - **Security**: The token is stored securely in GitHub Secrets and only used by GitHub Actions, so the risk is minimal
   - **Alternative**: If you prefer shorter expiration (30-90 days), set a calendar reminder to renew it before it expires
4. Copy the token and add it as `BACKUP_GITHUB_TOKEN` secret in GitHub (⚠️ Note: GitHub doesn't allow secret names starting with `GITHUB_`, so we use `BACKUP_GITHUB_TOKEN` instead)
5. **Important**: You'll also need to set this same token value in Supabase Edge Function secrets as `GITHUB_TOKEN` (see Step 4.5). The variable names are different, but use the same token value.

### Step 4: Deploy Supabase Edge Functions

This step deploys the Edge Functions that control the backup system. Edge Functions run on Supabase's infrastructure and handle triggering backups, checking status, and managing settings.

#### Prerequisites

Before deploying, ensure you have:

1. **Supabase CLI installed**
   ```bash
   # Check if Supabase CLI is installed
   supabase --version
   ```
   
   **If not installed, choose one of these methods:**
   
   **Windows (Recommended - using winget)**:
   ```powershell
   winget install --id=Supabase.CLI -e
   ```
   
   **Windows (Alternative - using Scoop)**:
   ```powershell
   # First install Scoop if you don't have it:
   # Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   # irm get.scoop.sh | iex
   
   # Then install Supabase CLI:
   scoop install supabase
   ```
   
   **Windows (Alternative - Standalone Binary)**:
   1. Download from: https://github.com/supabase/cli/releases/latest
   2. Download `supabase_windows_amd64.zip` (or appropriate for your architecture)
   3. Extract and add to your PATH
   
   **macOS**:
   ```bash
   brew install supabase/tap/supabase
   ```
   
   **Linux**:
   ```bash
   # Using the install script
   curl -fsSL https://supabase.com/install.sh | sh
   ```
   
   ⚠️ **Note**: `npm install -g supabase` is **NOT supported** anymore. Use one of the methods above.

2. **Node.js 18+ installed** (required for Supabase CLI)
   ```bash
   node --version  # Should be 18 or higher
   ```

3. **Access to your Supabase project** (you need to be a project owner or have deployment permissions)

#### Step 4.1: Login to Supabase

1. **Open PowerShell/Terminal** in your project directory

2. **Login to Supabase**:
   ```bash
   supabase login
   ```
   
3. **Follow the prompts**:
   - A browser window will open automatically
   - If it doesn't, copy the URL shown in the terminal and open it in your browser
   - Sign in with your Supabase account
   - Authorize the CLI to access your account
   - You should see "Successfully logged in" message

4. **Verify login**:
   ```bash
   supabase projects list
   ```
   This should show all your Supabase projects.

#### Step 4.2: Find Your Project Reference ID

You need your Supabase project reference ID to link the CLI to your project.

**Method 1: From Supabase Dashboard**
1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **Settings** → **General**
4. Find **Reference ID** (it looks like: `abcdefghijklmnop`)
5. Copy this ID

**Method 2: From Project URL**
- Your project URL is: `https://xxxxx.supabase.co`
- The `xxxxx` part is your project reference ID

#### Step 4.3: Link Your Project

Link your local project to your Supabase project:

```bash
supabase link --project-ref your-project-ref
```

**Example**:
```bash
supabase link --project-ref abcdefghijklmnop
```

**What happens**:
- The CLI will ask you for your database password (the one you set when creating the project)
- Enter your database password when prompted
- You should see: "Linked to project abcdefghijklmnop"

**Troubleshooting**:
- If you forgot your database password, reset it in Supabase Dashboard → Settings → Database → Reset database password
- If linking fails, make sure you're in the project root directory

#### Step 4.4: Deploy Edge Functions

Deploy each Edge Function one by one. Each function serves a specific purpose:

**1. Deploy `trigger-backup` function** (triggers manual backups):
```bash
supabase functions deploy trigger-backup
```

**2. Deploy `backup-status` function** (checks backup status):
```bash
supabase functions deploy backup-status
```

**3. Deploy `generate-signed-url` function** (generates S3 download URLs):
```bash
supabase functions deploy generate-signed-url
```

**4. Deploy `settings-toggle` function** (enables/disables backups):
```bash
supabase functions deploy settings-toggle
```

**5. Deploy `backup-history` function** (retrieves backup history):
```bash
supabase functions deploy backup-history
```

**Expected output for each deployment**:
```
Deploying function trigger-backup...
Function trigger-backup deployed successfully.
Function URL: https://xxxxx.supabase.co/functions/v1/trigger-backup
```

**Deploy all at once** (alternative):
```bash
# Deploy all functions in one command
supabase functions deploy trigger-backup backup-status generate-signed-url settings-toggle backup-history
```

**Verification**:
After deployment, verify each function is accessible:
```bash
# Test each function URL in your browser or with curl
curl https://your-project.supabase.co/functions/v1/trigger-backup
# Should return an authentication error (which is expected - means the function is deployed)
```

#### Step 4.5: Set Edge Function Secrets

Edge Functions need access to secrets (API keys, tokens, etc.) to function properly. Secrets are **shared across all Edge Functions** in your project, so you only need to set them once.

**Important**: Replace all placeholder values with your actual values!

```bash
# 1. Supabase Configuration
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 2. GitHub Configuration
# Note: Use the same token value you used for BACKUP_GITHUB_TOKEN in GitHub Secrets
supabase secrets set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
supabase secrets set GITHUB_OWNER=ManaSmart
supabase secrets set GITHUB_REPO=Mana_Smart
supabase secrets set GITHUB_WORKFLOW_ID=backup.yml

# 3. Backup API Key (must match VITE_BACKUP_API_KEY in frontend .env)
supabase secrets set BACKUP_API_KEY=your_secure_random_string_here

# 4. AWS S3 Configuration
supabase secrets set AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
supabase secrets set AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
supabase secrets set AWS_S3_REGION=us-east-1
supabase secrets set AWS_S3_BUCKET=your-backup-bucket-name
```

**Getting the values**:

- **SUPABASE_URL**: From Supabase Dashboard → Settings → API → Project URL
- **SUPABASE_SERVICE_ROLE_KEY**: From Supabase Dashboard → Settings → API → service_role key (⚠️ Keep secret!)
- **GITHUB_TOKEN**: The Personal Access Token you created earlier (⚠️ **Important**: Use the SAME VALUE as `BACKUP_GITHUB_TOKEN` in GitHub Secrets, but the variable name is different - see table below)
- **GITHUB_OWNER**: Your GitHub username or organization (e.g., `ManaSmart`)
- **GITHUB_REPO**: Your repository name (e.g., `Mana_Smart`)
- **BACKUP_API_KEY**: Generate with `openssl rand -hex 32` or use any secure random string (must match frontend `.env.local`)
- **AWS credentials**: From your AWS IAM user credentials
- **AWS_S3_REGION**: Your S3 bucket region (e.g., `us-east-1`, `eu-west-1`)
- **AWS_S3_BUCKET**: Your S3 bucket name

**📋 Variable Name Comparison:**

| Purpose | GitHub Secret Name | Supabase Secret Name | Same Value? |
|---------|-------------------|---------------------|------------|
| GitHub Token | `BACKUP_GITHUB_TOKEN` | `GITHUB_TOKEN` | ✅ **YES** (same token value) |
| GitHub Owner | `GITHUB_OWNER` | `GITHUB_OWNER` | ✅ **YES** (same name & value) |
| GitHub Repo | `GITHUB_REPO` | `GITHUB_REPO` | ✅ **YES** (same name & value) |
| Backup API Key | `BACKUP_API_KEY` | `BACKUP_API_KEY` | ✅ **YES** (same name & value) |
| Supabase URL | `SUPABASE_URL` | `SUPABASE_URL` | ✅ **YES** (same name & value) |
| Service Role Key | `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | ✅ **YES** (same name & value) |
| AWS Access Key | `AWS_ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` | ✅ **YES** (same name & value) |
| AWS Secret Key | `AWS_SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` | ✅ **YES** (same name & value) |
| AWS Region | `AWS_S3_REGION` | `AWS_S3_REGION` | ✅ **YES** (same name & value) |
| AWS Bucket | `AWS_S3_BUCKET` | `AWS_S3_BUCKET` | ✅ **YES** (same name & value) |
| Workflow ID | ❌ Not needed | `GITHUB_WORKFLOW_ID` | N/A (only in Supabase) |
| Database URL | `DATABASE_URL` | ❌ Not needed | N/A (only in GitHub) |
| Buckets List | `SUPABASE_BUCKETS_TO_BACKUP` | ❌ Not needed | N/A (only in GitHub) |

**⚠️ Important Notes:**
- **GitHub Token**: GitHub doesn't allow secret names starting with `GITHUB_`, so in GitHub Secrets it's called `BACKUP_GITHUB_TOKEN`, but in Supabase it's `GITHUB_TOKEN`. **Use the same token value in both places.**
- **Most other variables**: Use the same name and value in both GitHub Secrets and Supabase Secrets.
- **Some variables are only needed in one place**: `GITHUB_WORKFLOW_ID` is only in Supabase, while `DATABASE_URL` and `SUPABASE_BUCKETS_TO_BACKUP` are only in GitHub.

**Verify secrets are set**:
```bash
supabase secrets list
```

This will show all your secrets (values are hidden for security).

**🔄 How to Change/Rename a Secret:**

Supabase doesn't allow renaming secrets directly. To change a secret name:

1. **Set the new secret** with the correct name:
   ```bash
   supabase secrets set NEW_SECRET_NAME=your_value_here --project-ref your-project-ref
   ```

2. **Delete the old secret** (optional but recommended):
   ```bash
   supabase secrets unset OLD_SECRET_NAME --project-ref your-project-ref
   ```

**Example:** If you accidentally set `BACKUP_GITHUB_TOKEN` instead of `GITHUB_TOKEN`:
```bash
# 1. Set the correct name (use the same value)
supabase secrets set GITHUB_TOKEN=ghp_your_token_here --project-ref rqssjgiunwyjeyutgkkp

# 2. Delete the old one
supabase secrets unset BACKUP_GITHUB_TOKEN --project-ref rqssjgiunwyjeyutgkkp
```

**Note:** After changing secrets, you may need to redeploy your Edge Functions for the changes to take effect:
```bash
supabase functions deploy function-name --no-verify-jwt --project-ref your-project-ref
```

#### Step 4.6: Test Edge Functions

Test that your functions are working correctly:

**📍 Where to Get the Edge Function URL:**

The Edge Function URL follows this pattern:
```
https://[YOUR-PROJECT-REF].supabase.co/functions/v1/[FUNCTION-NAME]
```

**To find your project URL:**

1. **From Supabase Dashboard:**
   - Go to: https://app.supabase.com
   - Select your project
   - Go to **Settings** → **API**
   - Find **Project URL** (looks like: `https://abcdefghijklmnop.supabase.co`)
   - Copy this URL

2. **From Deployment Output:**
   - When you deploy a function (Step 4.4), the CLI shows the URL:
   ```
   Function URL: https://xxxxx.supabase.co/functions/v1/trigger-backup
   ```

3. **Construct the URL manually:**
   - Replace `[YOUR-PROJECT-REF]` with your project reference ID
   - Replace `[FUNCTION-NAME]` with the function name (e.g., `settings-toggle`, `trigger-backup`)
   - Example: If your project URL is `https://abcdefghijklmnop.supabase.co`, then:
     - `settings-toggle` URL: `https://abcdefghijklmnop.supabase.co/functions/v1/settings-toggle`
     - `trigger-backup` URL: `https://abcdefghijklmnop.supabase.co/functions/v1/trigger-backup`

**⚠️ Windows Users Note:**
- In **PowerShell**: Use backticks (`` ` ``) for line continuation, or use a single line
- In **CMD**: Use carets (`^`) for line continuation, or use a single line
- The backslash (`\`) used in bash/Linux examples doesn't work in Windows

**1. Test `settings-toggle`** (enable backups):

**Linux/macOS (bash):**
```bash
# Replace "your-project.supabase.co" with your actual project URL
curl -X POST https://your-project.supabase.co/functions/v1/settings-toggle \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"backup_enabled": true}'
```

**Windows PowerShell:**
```powershell
# Single line (recommended)
curl -X POST https://your-project.supabase.co/functions/v1/settings-toggle -H "Authorization: Bearer YOUR_BACKUP_API_KEY" -H "Content-Type: application/json" -d '{\"backup_enabled\": true}'

# Or with line continuation (use backticks)
curl -X POST https://your-project.supabase.co/functions/v1/settings-toggle `
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" `
  -H "Content-Type: application/json" `
  -d '{\"backup_enabled\": true}'
```

**Windows CMD:**
```cmd
curl -X POST https://your-project.supabase.co/functions/v1/settings-toggle -H "Authorization: Bearer YOUR_BACKUP_API_KEY" -H "Content-Type: application/json" -d "{\"backup_enabled\": true}"
```

**Expected response**:
```json
{"success": true, "message": "Backup enabled"}
```

**2. Test `trigger-backup`** (trigger a backup):

**Linux/macOS (bash):**
```bash
# Replace "your-project.supabase.co" with your actual project URL
curl -X POST https://your-project.supabase.co/functions/v1/trigger-backup \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json"
```

**Windows PowerShell:**
```powershell
# Single line (recommended)
curl -X POST https://your-project.supabase.co/functions/v1/trigger-backup -H "Authorization: Bearer YOUR_BACKUP_API_KEY" -H "Content-Type: application/json"

# Or with line continuation
curl -X POST https://your-project.supabase.co/functions/v1/trigger-backup `
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" `
  -H "Content-Type: application/json"
```

**Windows CMD:**
```cmd
curl -X POST https://your-project.supabase.co/functions/v1/trigger-backup -H "Authorization: Bearer YOUR_BACKUP_API_KEY" -H "Content-Type: application/json"
```

**Expected response**:
```json
{
  "dispatch_id": "abc-123-def",
  "status_url": "/functions/v1/backup-status?dispatch_id=abc-123-def",
  "message": "Backup workflow triggered successfully"
}
```

**3. Test `backup-status`**:

**Linux/macOS (bash):**
```bash
# Replace "your-project.supabase.co" with your actual project URL
curl -X GET "https://your-project.supabase.co/functions/v1/backup-status?dispatch_id=abc-123-def" \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY"
```

**Windows PowerShell/CMD:**
```powershell
# Single line
curl -X GET "https://your-project.supabase.co/functions/v1/backup-status?dispatch_id=abc-123-def" -H "Authorization: Bearer YOUR_BACKUP_API_KEY"
```

#### Troubleshooting Deployment Issues

**Issue: "Function not found"**
- **Solution**: Make sure you're in the project root directory where `supabase/functions/` folder exists
- Check that function folders exist: `supabase/functions/trigger-backup/`, etc.

**Issue: "Authentication failed"**
- **Solution**: Run `supabase login` again
- Verify you have the correct permissions on the project

**Issue: "Database password incorrect"**
- **Solution**: Reset your database password in Supabase Dashboard → Settings → Database
- Then run `supabase link` again

**Issue: "Secret not found" errors in function logs**
- **Solution**: Verify all secrets are set with `supabase secrets list`
- Make sure you used the exact secret names (case-sensitive)
- Re-deploy functions after setting secrets: `supabase functions deploy function-name`

**Issue: "Function deployment timeout"**
- **Solution**: Check your internet connection
- Try deploying one function at a time
- Check Supabase status page for service issues

**Issue: Functions return 401/403 errors**
- **Solution**: Verify `BACKUP_API_KEY` matches in:
  - Supabase secrets
  - Frontend `.env.local` file
  - The Authorization header in your test requests

#### Next Steps

After successfully deploying all functions and setting secrets:
1. ✅ All 5 Edge Functions deployed
2. ✅ All secrets configured
3. ✅ Functions tested and working
4. → Proceed to **Step 5: Configure GitHub Actions Workflow**

### Step 5: Configure GitHub Actions Workflow

The workflow file is already created at `.github/workflows/backup.yml`. Ensure:

1. The workflow file is committed to your repository
2. GitHub Actions is enabled for your repository
3. The default branch matches the workflow's `ref` (default is `main`)

To change the schedule, edit the cron expression in `.github/workflows/backup.yml`:

```yaml
schedule:
  - cron: '0 2 * * *'  # Daily at 2:00 AM UTC
```

### Step 6: Integrate Frontend Component

Add the `BackupSettings` component to your Settings page:

```tsx
// In src/components/Settings.tsx or your settings page
import { BackupSettings } from "./BackupSettings";

// Add a tab or section for backups
<TabsContent value="backup">
  <BackupSettings />
</TabsContent>
```

## Environment Variables

### Frontend Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `VITE_BACKUP_API_KEY` | Yes | API key for Edge Function authentication |

### GitHub Secrets (for Actions)

All secrets listed in [Step 3](#step-3-configure-github-secrets) are required.

### Edge Function Secrets

Same as GitHub Secrets, plus:
- `GITHUB_WORKFLOW_ID` (default: `backup.yml`)

## Testing

### Test Manual Backup via UI

1. Navigate to Settings → Backup
2. Click "Download Backup Now"
3. Wait for backup to complete (may take several minutes)
4. Verify download starts automatically

### Test via cURL

**📌 Important:** 
- Replace `https://your-project.supabase.co` in all examples below with your actual Supabase project URL. You can find it in:
  - **Supabase Dashboard** → **Settings** → **API** → **Project URL**
  - Or use the URL shown when you deploy functions (Step 4.4)
- Replace `YOUR_BACKUP_API_KEY` with your actual backup API key (same value as `VITE_BACKUP_API_KEY` in your `.env.local`)
- **Windows users:** Use single-line commands or see Step 4.6 for Windows-specific syntax

#### 1. Toggle Backup On/Off

**Linux/macOS:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/settings-toggle \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"backup_enabled": true}'
```

**Windows (PowerShell/CMD - single line):**
```powershell
curl -X POST https://your-project.supabase.co/functions/v1/settings-toggle -H "Authorization: Bearer YOUR_BACKUP_API_KEY" -H "Content-Type: application/json" -d "{\"backup_enabled\": true}"
```

#### 2. Trigger Manual Backup

**Linux/macOS:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/trigger-backup \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json"
```

**Windows (PowerShell/CMD - single line):**
```powershell
curl -X POST https://your-project.supabase.co/functions/v1/trigger-backup -H "Authorization: Bearer YOUR_BACKUP_API_KEY" -H "Content-Type: application/json"
```

Response:
```json
{
  "dispatch_id": "abc-123-def",
  "status_url": "/functions/v1/backup-status?dispatch_id=abc-123-def",
  "message": "Backup workflow triggered successfully"
}
```

#### 3. Poll Backup Status

**Linux/macOS:**
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/backup-status?dispatch_id=abc-123-def" \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY"
```

**Windows (PowerShell/CMD - single line):**
```powershell
curl -X GET "https://your-project.supabase.co/functions/v1/backup-status?dispatch_id=abc-123-def" -H "Authorization: Bearer YOUR_BACKUP_API_KEY"
```

Response (pending):
```json
{
  "status": "in_progress",
  "message": "Backup in progress"
}
```

Response (success):
```json
{
  "status": "success",
  "signed_url": "https://s3.amazonaws.com/...",
  "backup_id": "uuid-here"
}
```

#### 4. Get Backup History

**Linux/macOS:**
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/backup-history?limit=5" \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY"
```

**Windows (PowerShell/CMD - single line):**
```powershell
curl -X GET "https://your-project.supabase.co/functions/v1/backup-history?limit=5" -H "Authorization: Bearer YOUR_BACKUP_API_KEY"
```

#### 5. Generate Signed URL for Existing Backup

**Linux/macOS:**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-signed-url \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"s3_key": "backups/2024-01-15/backup-2024-01-15-02-00-UTC.zip"}'
```

**Windows (PowerShell/CMD - single line):**
```powershell
curl -X POST https://your-project.supabase.co/functions/v1/generate-signed-url -H "Authorization: Bearer YOUR_BACKUP_API_KEY" -H "Content-Type: application/json" -d "{\"s3_key\": \"backups/2024-01-15/backup-2024-01-15-02-00-UTC.zip\"}"
```

### Test Scheduled Backup

1. Manually trigger the workflow in GitHub Actions (Actions → backup.yml → Run workflow)
2. Or wait for the scheduled time (default: 2:00 AM UTC daily)
3. Check the workflow logs for any errors

## Troubleshooting

### Backup Fails with "Backup is disabled"

- Check `system_settings_kv` table: `SELECT * FROM system_settings_kv WHERE key = 'backup_enabled';`
- Ensure the value is `{"enabled": true}`
- Toggle the setting in the UI or via Edge Function

### Edge Function Returns 401/403

- Verify `BACKUP_API_KEY` matches in:
  - Frontend `.env` file
  - Supabase Edge Function secrets
  - GitHub Secrets (for workflow)
- Check Authorization header format: `Bearer YOUR_KEY`

### GitHub Actions Workflow Fails

**Database connection error:**
- Verify `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Ensure database is accessible from GitHub Actions runners
- Check if IP allowlist is blocking GitHub Actions IPs

**S3 upload fails:**
- Verify AWS credentials are correct
- Check S3 bucket permissions (needs `s3:PutObject` permission)
- Verify bucket region matches `AWS_S3_REGION`
- Check if bucket exists and is accessible

**Storage download fails:**
- Verify `SUPABASE_BUCKETS_TO_BACKUP` contains valid bucket names
- Check bucket names are comma-separated without spaces (or with spaces trimmed)
- Ensure service role key has storage access

### Backup Takes Too Long

- Large databases or many storage files can take 10-30+ minutes
- Consider using a self-hosted GitHub Actions runner (see [Alternative Deployment](#alternative-deployment-options))
- Check GitHub Actions timeout (default: 60 minutes)

### Signed URL Expires Too Quickly

- Default expiration is 15 minutes
- To change, edit `supabase/functions/generate-signed-url/index.ts`:
  ```typescript
  expiresIn: 900, // Change to desired seconds
  ```

## Security Checklist

- [ ] `BACKUP_API_KEY` is a strong random string (32+ characters)
- [ ] Service role key is stored only in secrets (never in code)
- [ ] AWS credentials have minimal required permissions (S3 read/write only)
- [ ] GitHub token has minimal scopes (`repo` and `workflow` only)
- [ ] S3 bucket has appropriate access policies (private, no public access)
- [ ] Edge Functions require authentication (verified)
- [ ] Database connection string uses SSL/TLS
- [ ] All secrets are stored in GitHub Secrets, not in code
- [ ] `.env` files are in `.gitignore`
- [ ] Signed URLs expire after reasonable time (15 minutes)
- [ ] RLS policies restrict access to backup_history

## Alternative Deployment Options

### Self-Hosted GitHub Actions Runner

For large backups or to avoid GitHub Actions time limits:

1. Set up a self-hosted runner on a VM or server
2. Install required tools:
   ```bash
   sudo apt-get update
   sudo apt-get install -y postgresql-client nodejs npm awscli
   ```
3. Configure the runner in GitHub: Settings → Actions → Runners → New self-hosted runner
4. Update workflow to use self-hosted runner:
   ```yaml
   jobs:
     backup:
       runs-on: self-hosted  # Instead of ubuntu-latest
   ```

### AWS Lambda + EventBridge (Alternative to GitHub Actions)

For a fully AWS-hosted solution:

1. **Create Lambda Function** with Node.js runtime
2. **Package dependencies**: `pg_dump` binary, `@supabase/supabase-js`, AWS SDK
3. **Set up EventBridge rule** for daily schedule (cron: `0 2 * * ? *`)
4. **Configure environment variables** in Lambda
5. **Set IAM permissions** for S3, Supabase access

**Note**: Lambda has 15-minute timeout limit. For longer backups, use Step Functions or ECS Fargate.

### Vercel Cron Jobs

If using Vercel, you can trigger the workflow via cron:

1. Create a Vercel cron job that calls your Edge Function
2. Edge Function triggers GitHub Actions workflow
3. Or directly execute backup logic in Edge Function (limited by 60s timeout)

## pg_dump Command Reference

The workflow uses this `pg_dump` command:

```bash
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --blobs \
  --verbose
```

**Flags explained:**
- `--no-owner`: Don't output commands to set ownership
- `--no-privileges`: Don't output commands to set privileges
- `--format=plain`: SQL script format (human-readable)
- `--blobs`: Include large objects (BLOBs)
- `--verbose`: Verbose output for debugging

**Alternative formats:**
- `--format=custom`: Binary format (smaller, faster)
- `--format=directory`: Directory format (parallel dump)

## Backup File Structure

Each backup archive contains:

```
backup-YYYY-MM-DD-HH-mm-UTC.zip
├── db/
│   └── backup.sql          # PostgreSQL dump
├── auth/
│   └── users.json          # Auth users export
└── storage/
    ├── bucket1/
    │   └── files...
    └── bucket2/
        └── files...
```

## Monitoring and Alerts

### Check Backup Status

Query `backup_history` table:

```sql
SELECT 
  id,
  created_at,
  status,
  size_bytes,
  error_text,
  s3_key
FROM backup_history
ORDER BY created_at DESC
LIMIT 10;
```

### Set Up Alerts

1. **GitHub Actions**: Configure notifications for workflow failures
2. **Supabase**: Set up database triggers to send alerts on backup failures
3. **AWS CloudWatch**: Monitor S3 uploads and set up alarms

## Support

For issues or questions:
1. Check GitHub Actions workflow logs
2. Review Supabase Edge Function logs
3. Check `backup_history` table for error messages
4. Verify all secrets are correctly configured

---

**Last Updated**: 2024-01-15

