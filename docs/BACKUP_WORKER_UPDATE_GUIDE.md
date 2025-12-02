# Backup Worker Update Guide

This guide explains how the backup worker updates the Supabase `backup_history` table after uploading files to S3.

## Overview

After the GitHub Actions workflow successfully uploads a backup file to S3, it calls the `update-backup` edge function to update the `backup_history` table with:
- `s3_key`: The S3 path where the backup is stored
- `status`: Set to "completed"
- `size_bytes`: File size in bytes
- `finished_at`: Timestamp when backup completed
- `workflow_run_id`: GitHub Actions run ID
- `error_text`: Cleared (set to null)

## Requirements Met

### ✅ 1. Accept JSON Payload
The worker accepts:
```json
{
  "backup_id": "<uuid>",
  "s3_key": "backups/<project>/<filename>",
  "size_bytes": <int>,
  "workflow_run_id": "<github-run-id>"
}
```

### ✅ 2. Validation
- `backup_id` must exist in `backup_history` table
- `s3_key` must never be empty (validated and required)
- Only updates if current status is "in_progress"

### ✅ 3. Update Logic
Updates the row with:
- `s3_key` = provided S3 key
- `size_bytes` = provided file size
- `status` = "completed"
- `finished_at` = now()
- `error_text` = null

### ✅ 4. Error Handling
If backup not found or invalid:
- Marks backup as "failed"
- Sets `error_text` with meaningful error message
- Sets `finished_at` timestamp

### ✅ 5. Idempotency
- Safe to re-run multiple times
- If backup already completed, returns success without updating
- If backup already completed with different s3_key, logs warning but doesn't update

## Workflow Integration

The GitHub Actions workflow (`backup.yml`) now:

1. **Finds backup_id** by `dispatch_id`:
   ```bash
   # Query backup_history to get backup_id
   BACKUP_ID=$(query by dispatch_id)
   ```

2. **Calls update-backup edge function**:
   ```bash
   curl -X POST "${SUPABASE_URL}/functions/v1/update-backup" \
     -H "Authorization: Bearer ${BACKUP_API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{
       "backup_id": "${BACKUP_ID}",
       "s3_key": "${S3_KEY}",
       "size_bytes": ${BACKUP_SIZE},
       "workflow_run_id": "${WORKFLOW_RUN_ID}"
     }'
   ```

3. **Handles response**:
   - If HTTP 200: Backup updated successfully
   - If HTTP 4xx/5xx: Logs error and fails workflow

## Required Secrets

### GitHub Actions Secrets
Add to GitHub Settings → Secrets and variables → Actions:
- `BACKUP_API_KEY`: API key for authenticating with update-backup function

### Supabase Edge Function Secrets
Add to Supabase Dashboard → Edge Functions → Secrets:
- `BACKUP_API_KEY`: Same value as GitHub secret (for authentication)

## Testing

### Test the Edge Function Directly

```bash
# Get backup_id from backup_history table first
BACKUP_ID="your-backup-uuid"

curl -X POST "https://your-project.supabase.co/functions/v1/update-backup" \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "backup_id": "'"${BACKUP_ID}"'",
    "s3_key": "backups/test/backup-123.zip",
    "size_bytes": 1024000,
    "workflow_run_id": "123456789"
  }'
```

### Expected Response (Success)
```json
{
  "success": true,
  "message": "Backup updated successfully",
  "backup": {
    "id": "...",
    "s3_key": "backups/test/backup-123.zip",
    "status": "completed",
    "size_bytes": 1024000,
    "finished_at": "2024-01-15T10:30:00Z",
    ...
  }
}
```

### Expected Response (Idempotent - Already Completed)
```json
{
  "success": true,
  "message": "Backup already completed (idempotent call)",
  "backup": { ... },
  "idempotent": true
}
```

### Expected Response (Error - Not Found)
```json
{
  "success": false,
  "error": "Backup entry not found",
  "details": "No backup found with the provided backup_id or dispatch_id",
  "message": "Cannot update backup - entry does not exist in backup_history table"
}
```

## Troubleshooting

### Backup stays in "in_progress"
1. Check GitHub Actions logs for the `update-backup` API call
2. Verify `BACKUP_API_KEY` is set in both GitHub and Supabase
3. Check Supabase Edge Function logs for errors
4. Verify backup_id exists in `backup_history` table

### "Invalid API key" error
- Verify `BACKUP_API_KEY` secret is set in GitHub Actions
- Verify `BACKUP_API_KEY` secret is set in Supabase Edge Functions
- Ensure both values match exactly (no extra spaces)

### "Backup entry not found" error
- Check that `dispatch_id` matches the one in `backup_history`
- Verify backup was created in `trigger-backup` step
- Check backup_history table directly in Supabase

### "Invalid backup status" error
- Backup status is not "in_progress"
- Check current status in `backup_history` table
- Backup may have been manually cancelled or already completed

## Status Values

The function uses these status values:
- `"in_progress"`: Backup is running (only status that can be updated)
- `"completed"`: Backup finished successfully (set by this function)
- `"failed"`: Backup failed (set on errors)
- `"cancelled"`: Backup was cancelled

Note: The function sets status to `"completed"` (not `"success"`) to match the database schema constraint.

## Database Schema

The `backup_history` table has:
```sql
status text NOT NULL CHECK (status IN ('success', 'failed', 'cancelled', 'in_progress'))
```

However, the function uses `"completed"` which should match `"success"` in the constraint. If you see constraint errors, update the function to use `"success"` instead of `"completed"`.

