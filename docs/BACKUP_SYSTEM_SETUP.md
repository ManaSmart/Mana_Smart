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
| `SUPABASE_BUCKETS_TO_BACKUP` | Comma-separated bucket names | `uploads,documents,images` |
| `GITHUB_TOKEN` | Personal Access Token (repo + workflow permissions) | `ghp_xxxxx` |
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
3. Copy the token and add it as `GITHUB_TOKEN` secret

### Step 4: Deploy Supabase Edge Functions

Deploy all Edge Functions to Supabase:

```bash
# Login to Supabase (if not already)
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy all functions
supabase functions deploy trigger-backup
supabase functions deploy backup-status
supabase functions deploy generate-signed-url
supabase functions deploy settings-toggle
supabase functions deploy backup-history
```

#### Set Edge Function Secrets

For each Edge Function, set the required secrets:

```bash
# Set secrets for all functions
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set GITHUB_TOKEN=your_github_token
supabase secrets set GITHUB_OWNER=your_github_owner
supabase secrets set GITHUB_REPO=your_github_repo
supabase secrets set GITHUB_WORKFLOW_ID=backup.yml
supabase secrets set BACKUP_API_KEY=your_backup_api_key
supabase secrets set AWS_ACCESS_KEY_ID=your_aws_access_key
supabase secrets set AWS_SECRET_ACCESS_KEY=your_aws_secret_key
supabase secrets set AWS_S3_REGION=us-east-1
supabase secrets set AWS_S3_BUCKET=your_bucket_name
```

**Note**: Secrets are shared across all Edge Functions in a project.

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

#### 1. Toggle Backup On/Off

```bash
curl -X POST https://your-project.supabase.co/functions/v1/settings-toggle \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"backup_enabled": true}'
```

#### 2. Trigger Manual Backup

```bash
curl -X POST https://your-project.supabase.co/functions/v1/trigger-backup \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json"
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

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/backup-status?dispatch_id=abc-123-def" \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY"
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

```bash
curl -X GET "https://your-project.supabase.co/functions/v1/backup-history?limit=5" \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY"
```

#### 5. Generate Signed URL for Existing Backup

```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-signed-url \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"s3_key": "backups/2024-01-15/backup-2024-01-15-02-00-UTC.zip"}'
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

