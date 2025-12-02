# Backup Update Troubleshooting Guide

## Problem: Backup Stuck in "in_progress" Status

If backups are staying in "in_progress" status even after the GitHub Actions workflow completes, follow these steps:

## Step 1: Check GitHub Actions Logs

1. Go to GitHub → Actions → Latest workflow run
2. Find the step: **"Update backup_history via Edge Function"**
3. Check for errors in the logs

### Common Issues:

#### Issue: "Could not find backup_id"
**Cause**: The backup entry was not created in `backup_history` table
**Solution**: 
- Check the `trigger-backup` step logs
- Verify the backup entry was created with the correct `dispatch_id`
- Check Supabase `backup_history` table directly

#### Issue: "Edge function call failed (HTTP 401)"
**Cause**: `BACKUP_API_KEY` is missing or incorrect
**Solution**:
- The workflow will automatically fall back to direct Supabase update
- If fallback also fails, check `SUPABASE_SERVICE_ROLE_KEY` secret

#### Issue: "Edge function call failed (HTTP 404)"
**Cause**: Edge function `update-backup` is not deployed
**Solution**:
```bash
supabase functions deploy update-backup
```

#### Issue: "Edge function call failed (HTTP 500)"
**Cause**: Edge function error
**Solution**:
- Check Supabase Dashboard → Edge Functions → Logs
- Look for error messages in the `update-backup` function logs

## Step 2: Verify Secrets Are Set

### Required GitHub Secrets:
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `BACKUP_API_KEY`: API key for edge function (optional, will use fallback if not set)

### How to Check:
1. Go to GitHub → Settings → Secrets and variables → Actions
2. Verify all secrets are set
3. Note: `BACKUP_API_KEY` is optional - if not set, the workflow uses direct Supabase update

## Step 3: Check Supabase Database

Run this query in Supabase SQL Editor:

```sql
SELECT 
  id,
  dispatch_id,
  s3_key,
  status,
  size_bytes,
  finished_at,
  error_text,
  workflow_run_id,
  created_at
FROM backup_history
WHERE dispatch_id = 'your-dispatch-id-here'
ORDER BY created_at DESC
LIMIT 1;
```

### Expected Results:
- `s3_key`: Should be set (e.g., "backups/2024/01/15/backup-xxx.zip")
- `status`: Should be "success" (not "in_progress")
- `finished_at`: Should have a timestamp
- `size_bytes`: Should have a number

### If s3_key is NULL:
- The update step failed
- Check GitHub Actions logs for the error
- Manually update using the SQL below

## Step 4: Manual Fix (If Needed)

If the automatic update failed, you can manually update the backup:

```sql
-- Find the backup by dispatch_id
UPDATE backup_history
SET 
  s3_key = 'backups/YYYY/MM/DD/backup-filename.zip', -- Replace with actual S3 key
  status = 'success',
  finished_at = NOW(),
  size_bytes = 1234567, -- Replace with actual file size
  error_text = NULL
WHERE dispatch_id = 'your-dispatch-id-here'
  AND status = 'in_progress';

-- Verify the update
SELECT id, dispatch_id, s3_key, status, finished_at 
FROM backup_history 
WHERE dispatch_id = 'your-dispatch-id-here';
```

## Step 5: Test Edge Function Directly

Test the edge function to verify it's working:

```bash
# Get backup_id from database first
BACKUP_ID="your-backup-uuid"

curl -X POST "https://your-project.supabase.co/functions/v1/update-backup" \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "backup_id": "'"${BACKUP_ID}"'",
    "s3_key": "backups/test/backup.zip",
    "size_bytes": 1024000,
    "workflow_run_id": "123456789"
  }'
```

### Expected Response:
```json
{
  "success": true,
  "message": "Backup updated successfully",
  "backup": {
    "id": "...",
    "s3_key": "backups/test/backup.zip",
    "status": "success",
    ...
  }
}
```

## Step 6: Verify S3 Upload

Check if the file actually exists in S3:

```bash
aws s3 ls s3://your-bucket/backups/ --recursive | grep "your-dispatch-id"
```

Or check the S3 key from the workflow logs:
- Look for: `S3_KEY=backups/YYYY/MM/DD/backup-filename.zip`
- Verify this file exists in your S3 bucket

## Common Solutions

### Solution 1: Deploy Edge Function
```bash
supabase functions deploy update-backup
```

### Solution 2: Set BACKUP_API_KEY
1. Generate a secure random string: `openssl rand -hex 32`
2. Add to GitHub Secrets: `BACKUP_API_KEY`
3. Add to Supabase Edge Function secrets: `BACKUP_API_KEY`

### Solution 3: Use Fallback (No API Key Needed)
The workflow automatically falls back to direct Supabase update if:
- `BACKUP_API_KEY` is not set, OR
- Edge function call fails

The fallback should work as long as `VITE_SUPABASE_SERVICE_ROLE_KEY` is set.

### Solution 4: Check RLS Policies
If direct update fails, check Row Level Security policies:

```sql
-- Check RLS policies on backup_history
SELECT * FROM pg_policies WHERE tablename = 'backup_history';

-- If needed, temporarily disable RLS for testing (NOT recommended for production)
ALTER TABLE backup_history DISABLE ROW LEVEL SECURITY;
```

## Debugging Workflow Step

Add this to the workflow step to see what's happening:

```yaml
- name: Debug Update Step
  run: |
    echo "DISPATCH_ID: $DISPATCH_ID"
    echo "S3_KEY: $S3_KEY"
    echo "BACKUP_SIZE: $BACKUP_SIZE"
    echo "SUPABASE_URL: ${SUPABASE_URL:0:30}..."
    echo "BACKUP_API_KEY set: ${BACKUP_API_KEY:+YES}${BACKUP_API_KEY:-NO}"
```

## Still Not Working?

1. **Check workflow logs** for the exact error message
2. **Check Supabase Edge Function logs** for errors
3. **Verify S3 file exists** at the expected path
4. **Manually update** the database using the SQL above
5. **Check RLS policies** aren't blocking the update

## Prevention

To prevent this issue:
1. Always set `BACKUP_API_KEY` in both GitHub and Supabase
2. Deploy the `update-backup` edge function
3. Monitor workflow logs after each backup
4. Set up alerts for failed backups

