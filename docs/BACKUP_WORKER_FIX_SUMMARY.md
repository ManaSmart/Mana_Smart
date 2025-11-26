# Backup Worker Fix - Complete Summary

## Problem
Backups were staying stuck in "in_progress" status and `s3_key` was never being set in the `backup_history` table, even though GitHub Actions successfully uploaded files to S3.

## Solution Implemented

### 1. Updated `update-backup` Edge Function

**File**: `supabase/functions/update-backup/index.ts`

**Requirements Met:**
- ✅ Accepts JSON payload with `backup_id`, `s3_key`, `size_bytes`, `workflow_run_id`
- ✅ Validates `backup_id` exists in `backup_history` table
- ✅ Validates `s3_key` is never empty
- ✅ Only updates if current status is "in_progress"
- ✅ Sets `status = "success"`, `s3_key`, `size_bytes`, `finished_at`, clears `error_text`
- ✅ Marks as "failed" with error message if backup not found or invalid
- ✅ Idempotent - safe to re-run, ignores if already completed

**Key Features:**
- Supports both `backup_id` and `dispatch_id` (finds backup_id from dispatch_id)
- Comprehensive error handling with meaningful messages
- Idempotency checks prevent duplicate updates
- Validates all inputs before processing

### 2. Updated GitHub Actions Workflow

**File**: `.github/workflows/backup.yml`

**Changes:**
1. **Finds backup_id** by querying `backup_history` with `dispatch_id`
2. **Calls update-backup edge function** instead of direct Supabase update
3. **Uses proper authentication** with `BACKUP_API_KEY`
4. **Handles errors** properly with exit codes

**New Step Flow:**
```yaml
- name: Update backup_history via Edge Function
  run: |
    1. Find backup_id from dispatch_id
    2. Call update-backup edge function with:
       - backup_id
       - s3_key
       - size_bytes
       - workflow_run_id
    3. Handle response and errors
```

### 3. Required Secrets

**GitHub Actions Secrets:**
- `BACKUP_API_KEY`: API key for authenticating with update-backup function

**Supabase Edge Function Secrets:**
- `BACKUP_API_KEY`: Same value as GitHub secret

## How It Works

1. **GitHub Actions uploads backup to S3**
   - File uploaded to: `s3://bucket/backups/YYYY/MM/DD/backup-{timestamp}.zip`
   - S3 path stored in `S3_KEY` environment variable

2. **Workflow finds backup_id**
   - Queries `backup_history` table using `dispatch_id`
   - Extracts `backup_id` (UUID)

3. **Workflow calls update-backup function**
   - POST to `/functions/v1/update-backup`
   - Sends: `backup_id`, `s3_key`, `size_bytes`, `workflow_run_id`
   - Authenticates with `BACKUP_API_KEY`

4. **Edge function validates and updates**
   - Validates backup exists and status is "in_progress"
   - Updates: `s3_key`, `status = "success"`, `size_bytes`, `finished_at`, `error_text = null`
   - Returns success or error

5. **Frontend detects completion**
   - Polls `backup_history` table
   - Sees `s3_key` is set and `status = "success"`
   - Shows download button
   - Stops spinner

## Deployment Checklist

- [ ] Run database migration: `008_add_finished_at_to_backup_history.sql`
- [ ] Deploy edge function: `supabase functions deploy update-backup`
- [ ] Set `BACKUP_API_KEY` in Supabase Edge Function secrets
- [ ] Set `BACKUP_API_KEY` in GitHub Actions secrets
- [ ] Test workflow by triggering a manual backup
- [ ] Verify `backup_history` table updates correctly
- [ ] Verify frontend shows download button

## Testing

### Manual Test
```bash
# 1. Trigger a backup via frontend
# 2. Wait for GitHub Actions to complete
# 3. Check backup_history table:
SELECT id, dispatch_id, s3_key, status, size_bytes, finished_at 
FROM backup_history 
WHERE dispatch_id = 'your-dispatch-id';

# Should show:
# - s3_key: "backups/2024/01/15/backup-xxx.zip"
# - status: "success"
# - size_bytes: <number>
# - finished_at: <timestamp>
```

### Edge Function Test
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/update-backup" \
  -H "Authorization: Bearer YOUR_BACKUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "backup_id": "your-backup-uuid",
    "s3_key": "backups/test/backup.zip",
    "size_bytes": 1024000,
    "workflow_run_id": "123456789"
  }'
```

## Troubleshooting

### Backup still stuck in "in_progress"
1. Check GitHub Actions logs for the `update-backup` call
2. Verify `BACKUP_API_KEY` is set correctly
3. Check Supabase Edge Function logs
4. Verify backup_id exists in `backup_history`

### "Invalid API key" error
- Verify `BACKUP_API_KEY` matches in both GitHub and Supabase
- Check for extra spaces or newlines in the secret

### "Backup entry not found"
- Verify `dispatch_id` matches the one in `backup_history`
- Check that backup was created in `trigger-backup` step

### "Invalid backup status"
- Backup status is not "in_progress"
- May have been manually cancelled or already completed
- Check current status in database

## Files Modified

1. `supabase/functions/update-backup/index.ts` - Complete rewrite with all requirements
2. `.github/workflows/backup.yml` - Updated to call edge function instead of direct update
3. `supabase/migrations/008_add_finished_at_to_backup_history.sql` - Added `finished_at` column

## Files Created

1. `docs/BACKUP_WORKER_UPDATE_GUIDE.md` - Detailed guide for the worker
2. `docs/BACKUP_WORKER_FIX_SUMMARY.md` - This summary document

## Next Steps

1. Deploy the edge function
2. Set the `BACKUP_API_KEY` secret
3. Test with a manual backup
4. Monitor logs to ensure it works correctly
5. Update documentation if needed

The system is now ready to properly update backup records after S3 uploads complete!

