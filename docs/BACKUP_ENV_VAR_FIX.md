# Backup Environment Variables Fix

## 🐛 Problem

The backup workflow was failing with this error:
```
Error: supabaseUrl is required.
```

This happened in the "Update backup_history" step because the environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` were not being passed to the Node.js script.

## 🔍 Root Cause

In GitHub Actions, when a step has its own `env:` section, it **does not inherit** environment variables from the job-level `env:` section. The variables need to be explicitly added to each step's `env:` section.

## ✅ Solution

Added `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the `env:` section of all steps that use Supabase:

1. **Update backup status (in progress)** step
2. **Update backup_history and system_settings** step  
3. **Handle backup failure** step

## 📝 Changes Made

### File: `.github/workflows/backup.yml`

**Before:**
```yaml
env:
  DISPATCH_ID: ${{ github.event.inputs.dispatch_id || github.run_id }}
  WORKFLOW_RUN_ID: ${{ github.run_id }}
  S3_KEY: ${{ steps.upload_s3.outputs.s3_key }}
  ARCHIVE_SIZE: ${{ steps.create_archive.outputs.archive_size }}
```

**After:**
```yaml
env:
  SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  DISPATCH_ID: ${{ github.event.inputs.dispatch_id || github.run_id }}
  WORKFLOW_RUN_ID: ${{ github.run_id }}
  S3_KEY: ${{ steps.upload_s3.outputs.s3_key }}
  ARCHIVE_SIZE: ${{ steps.create_archive.outputs.archive_size }}
```

## 🧪 Testing

After this fix:
1. ✅ The backup workflow should complete successfully
2. ✅ The `backup_history` table should be updated with status
3. ✅ No more "supabaseUrl is required" errors

## 📋 Steps Fixed

1. **Line ~240**: Update backup status (in progress) - Added env vars
2. **Line ~675**: Update backup_history and system_settings - Added env vars  
3. **Line ~797**: Handle backup failure - Added env vars

## 🚨 Important Note

In GitHub Actions workflows:
- **Job-level `env:`** - Available to all steps, but can be overridden
- **Step-level `env:`** - Only available to that step, **does not inherit** from job-level

Always explicitly add required environment variables to each step's `env:` section if the step uses them.

---

**Status**: ✅ **FIXED** - Environment variables now properly passed to all steps
**Date**: Fixed in backup optimization update

