# Backup File Location Guide

## 📍 Where Backup Files Are Stored

### AWS S3 Storage

All backup files are stored in **AWS S3** (not in GitHub Actions or Supabase).

### S3 Path Structure

Backup files are organized by date in S3:

```
s3://YOUR_BUCKET_NAME/backups/YYYY/MM/DD/backup-YYYY-MM-DD-HH-MM-UTC.zip
```

**Example:**
```
s3://my-backup-bucket/backups/2024/01/15/backup-2024-01-15-14-30-UTC.zip
```

### S3 Bucket Configuration

The S3 bucket name is configured in GitHub Secrets:
- **Secret Name**: `AWS_S3_BUCKET`
- **Region**: `AWS_S3_REGION` (e.g., `us-east-1`)

## 🔍 How to Find Your Backup Files

### Method 1: Via Database (Recommended)

The S3 path is stored in the `backup_history` table:

```sql
SELECT 
  id,
  s3_key,
  created_at,
  status,
  size_bytes,
  error_text
FROM backup_history
ORDER BY created_at DESC;
```

**Example Result:**
```
s3_key: "backups/2024/01/15/backup-2024-01-15-14-30-UTC.zip"
```

### Method 2: Via UI (Backup Settings Page)

1. Go to **Settings** → **Backup** tab
2. View **Backup History** table
3. Click **Download** button next to any backup
4. The system will generate a signed URL (valid for 15 minutes)

### Method 3: Direct S3 Access

If you have AWS credentials:

```bash
# List all backups
aws s3 ls s3://YOUR_BUCKET_NAME/backups/ --recursive

# Download a specific backup
aws s3 cp s3://YOUR_BUCKET_NAME/backups/2024/01/15/backup-2024-01-15-14-30-UTC.zip ./
```

## 📦 Backup File Contents

Each backup ZIP file contains:

```
backup-YYYY-MM-DD-HH-MM-UTC.zip
├── db/
│   └── backup.sql          # Database export (INSERT statements)
├── auth/
│   └── users.json         # Supabase Auth users (if applicable)
└── storage/
    ├── bucket1/
    │   └── files...
    └── bucket2/
        └── files...
```

## 🔐 Accessing Backups

### Via UI (Signed URLs)

The UI uses the `generate-signed-url` Edge Function to create temporary download links:

1. **Valid for**: 15 minutes
2. **Requires**: Authentication (admin role)
3. **Access**: Settings → Backup → Download button

### Via API

You can also generate signed URLs programmatically:

```typescript
import { generateSignedUrl } from '@/lib/backupApi';

const { signed_url } = await generateSignedUrl(s3Key);
// Use signed_url to download the backup
```

### Direct S3 Access

If you have AWS credentials configured:

```bash
# Download using AWS CLI
aws s3 cp s3://BUCKET_NAME/backups/2024/01/15/backup-file.zip ./

# Or use AWS Console
# Go to: https://console.aws.amazon.com/s3/
# Navigate to your bucket → backups/ → date folder
```

## 📊 Backup Metadata

All backup information is stored in `backup_history` table:

| Column | Description |
|--------|-------------|
| `id` | Unique backup ID (UUID) |
| `s3_key` | S3 path to backup file |
| `created_at` | When backup was created |
| `status` | `success`, `failed`, `partial`, `in_progress`, `cancelled` |
| `size_bytes` | Backup file size in bytes |
| `error_text` | Error message (if failed) |
| `workflow_run_id` | GitHub Actions run ID |
| `dispatch_id` | Manual backup trigger ID |

## 🗂️ Backup File Naming

Format: `backup-YYYY-MM-DD-HH-MM-UTC.zip`

**Example:**
- `backup-2024-01-15-14-30-UTC.zip`
- Created on: January 15, 2024 at 14:30 UTC

## 📝 Notes

1. **Backup files are NOT stored in GitHub Actions** - they're only created temporarily during the workflow
2. **Backup files are NOT stored in Supabase** - they're in your AWS S3 bucket
3. **S3 path is stored in database** - check `backup_history.s3_key` column
4. **Signed URLs expire** - download links are valid for 15 minutes only
5. **Admin access required** - only admins can download backups via UI

## 🔄 Backup Retention

Currently, backups are **not automatically deleted**. You should:

1. **Set up S3 lifecycle policies** to automatically delete old backups
2. **Or manually delete** old backups via AWS Console
3. **Or use the UI** to delete backup history entries (this only deletes the database record, not the S3 file)

## 🆘 Troubleshooting

### Can't find backup file?

1. Check `backup_history` table for `s3_key`
2. Verify S3 bucket name in GitHub Secrets
3. Check AWS credentials have read access
4. Verify backup status is `success` (not `failed`)

### Can't download backup?

1. Check you're logged in as admin
2. Verify signed URL hasn't expired (15 minutes)
3. Check S3 bucket permissions
4. Verify backup file exists in S3

---

**Summary**: Backups are stored in **AWS S3** at path `backups/YYYY/MM/DD/backup-TIMESTAMP.zip`. The S3 path is stored in `backup_history.s3_key` and can be accessed via the UI or directly from S3.

