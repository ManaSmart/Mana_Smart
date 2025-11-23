# Backup Storage Information

## Where Backups Are Stored

Backups are stored in **AWS S3** (Amazon Simple Storage Service). The exact location depends on your S3 bucket configuration.

### S3 Storage Path

Backups are stored with the following structure:

```
s3://[YOUR_S3_BUCKET]/backups/[DATE]/backup-[TIMESTAMP].zip
```

Example:
```
s3://my-backup-bucket/backups/2024-11-23/backup-2024-11-23-14-30-45-UTC.zip
```

### Backup Contents

Each backup archive (ZIP file) contains:

1. **Database Backup** (`backup/db/backup.sql`)
   - Complete PostgreSQL database dump
   - Includes schema, data, functions, and RLS policies

2. **Storage Files** (`backup/storage/[bucket]/[files]`)
   - All files from configured Supabase Storage buckets
   - Organized by bucket name

3. **Auth Users** (`backup/auth/users.json`)
   - Exported authentication user data
   - Includes user metadata and app metadata

## How to Verify Backups Are Working

### 1. Check GitHub Actions

1. Go to your GitHub repository
2. Click on **Actions** tab
3. Look for workflow runs named **"Database and Storage Backup"**
4. Click on a run to see detailed logs

**What to look for:**
- ✅ Green checkmark = Backup completed successfully
- ❌ Red X = Backup failed (check logs for errors)
- 🟡 Yellow circle = Backup in progress

### 2. Check Backup History in UI

1. Go to **Settings** → **Backup** tab
2. Check the **Backup History** section
3. Look for entries with:
   - ✅ **Success** status = Backup completed
   - ⏳ **In Progress** = Backup still running
   - ❌ **Failed** = Backup failed (check error message)
   - 🚫 **Cancelled** = Backup was cancelled

### 3. Check S3 Bucket Directly

If you have AWS CLI installed:

```bash
# List all backups
aws s3 ls s3://[YOUR_BUCKET]/backups/ --recursive

# Download a specific backup
aws s3 cp s3://[YOUR_BUCKET]/backups/2024-11-23/backup-2024-11-23-14-30-45-UTC.zip ./
```

Or use the AWS Console:
1. Go to AWS S3 Console
2. Navigate to your bucket
3. Look in the `backups/` folder
4. Browse by date folders

### 4. Check Workflow Logs

In GitHub Actions, check these steps:

1. **"Check backup enabled status"** - Should show "Manual trigger - proceeding with backup"
2. **"Dump PostgreSQL database"** - Should show database size
3. **"Download Supabase Storage files"** - Should show number of files downloaded
4. **"Create backup archive"** - Should show archive size
5. **"Upload to S3"** - Should show S3 key where backup is stored
6. **"Update backup_history"** - Should show "Backup history updated successfully"

## Troubleshooting

### Backup Never Completes

**Possible causes:**
1. **Workflow not running** - Check GitHub Actions tab
2. **Backup disabled** - Manual triggers now always run, but check Settings
3. **Storage download taking too long** - Many files can take 20+ minutes
4. **S3 upload failing** - Check AWS credentials and permissions

**Solutions:**
- Check GitHub Actions logs for errors
- Verify all GitHub Secrets are set correctly
- Check AWS S3 bucket permissions
- Reduce number of buckets in `SUPABASE_BUCKETS_TO_BACKUP` if too many files

### Backup Shows "In Progress" Forever

**Possible causes:**
1. Workflow is still running (check GitHub Actions)
2. Workflow failed but didn't update database
3. Network timeout during S3 upload

**Solutions:**
- Check GitHub Actions to see if workflow is still running
- If workflow completed but status stuck, manually cancel it
- Check S3 bucket to see if backup file exists

### No Backups in S3

**Possible causes:**
1. S3 upload step failed
2. Wrong S3 bucket name
3. AWS credentials incorrect
4. S3 bucket doesn't exist

**Solutions:**
- Check GitHub Actions logs for S3 upload errors
- Verify `AWS_S3_BUCKET` secret matches your actual bucket name
- Verify AWS credentials have S3 write permissions
- Create the S3 bucket if it doesn't exist

## Accessing Backups

### Download from UI

1. Go to **Settings** → **Backup** tab
2. Find a successful backup in **Backup History**
3. Click **Download** button
4. A pre-signed URL will open in a new tab for download

### Download from S3 Directly

**Using AWS CLI:**
```bash
aws s3 cp s3://[BUCKET]/backups/2024-11-23/backup-2024-11-23-14-30-45-UTC.zip ./
```

**Using AWS Console:**
1. Go to S3 Console
2. Navigate to your bucket → `backups/` → date folder
3. Click on the backup file
4. Click "Download" or "Download as"

## Backup Retention

Currently, backups are stored indefinitely in S3. You may want to:

1. **Set up S3 Lifecycle Policies** to automatically delete old backups
2. **Manually delete** old backups from S3
3. **Archive to Glacier** for long-term storage at lower cost

## Security

- Backups are stored in **private S3 buckets** (not publicly accessible)
- Downloads use **pre-signed URLs** that expire after 7 days
- Only users with proper authentication can trigger backups
- S3 bucket should have proper IAM policies restricting access

## Configuration

Backup storage location is determined by these GitHub Secrets:

- `AWS_S3_BUCKET` - The S3 bucket name
- `AWS_S3_REGION` - The AWS region (e.g., `us-east-1`, `eu-north-1`)
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

Make sure these are correctly configured in:
**GitHub Repository → Settings → Secrets and variables → Actions**

