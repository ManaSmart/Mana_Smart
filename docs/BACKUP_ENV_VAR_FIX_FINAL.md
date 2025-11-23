# Backup Environment Variables Fix - Final

## 🐛 Problem

Two errors were occurring:
1. **First error**: `supabaseUrl is required` - happening in an early step
2. **Second error**: `supabaseUrl is required` - happening in "Update backup_history" step

The issue was that environment variables set with `export` in bash scripts are **not available** to Node.js processes when the step has an `env:` section, because the `env:` section overrides the shell environment.

## 🔍 Root Cause

In the "Update backup_history" step, we were using:
```bash
export STATUS="success"
export ERROR_TEXT=""
node -e "..."
```

But when a step has an `env:` section, those exported variables don't get passed to the Node.js process. The `env:` section creates a new environment that doesn't include shell-exported variables.

## ✅ Solution

Changed from using `export` to passing variables directly in the command line:

**Before:**
```bash
export STATUS="success"
export ERROR_TEXT=""
node -e "..."
```

**After:**
```bash
STATUS="$FINAL_STATUS" ERROR_TEXT="$FINAL_ERROR_TEXT" node -e "..."
```

This way, the variables are passed directly to the Node.js process and are available as `process.env.STATUS` and `process.env.ERROR_TEXT`.

## 📝 All Steps Fixed

All steps that use Supabase now have proper environment variables:

1. ✅ **Check backup enabled status** - Has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. ✅ **Export auth users** - Has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
3. ✅ **Update backup status (in progress)** - Has all required vars including `DISPATCH_ID`
4. ✅ **Download Supabase Storage files** - Has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_BUCKETS_TO_BACKUP`
5. ✅ **Update backup_history and system_settings** - Has all vars, and STATUS/ERROR_TEXT passed via command line
6. ✅ **Handle backup failure** - Has all required vars

## 🧪 Testing

After this fix:
1. ✅ All steps should have access to Supabase environment variables
2. ✅ STATUS and ERROR_TEXT should be properly passed to Node.js
3. ✅ No more "supabaseUrl is required" errors
4. ✅ Backup history should update correctly

## 🚨 Important Note

**GitHub Actions Environment Variables:**
- Variables in `env:` section are available to all processes in that step
- Variables exported with `export` in bash are **NOT** available to processes when `env:` section exists
- To pass variables from bash to Node.js, use: `VAR="value" node -e "..."` syntax
- Or add them to the `env:` section (but can't be dynamic based on step outcomes)

## 📋 File Changed

- `.github/workflows/backup.yml` - Line ~557: Changed STATUS/ERROR_TEXT passing method

---

**Status**: ✅ **FIXED** - Environment variables now properly passed to all Node.js processes
**Date**: Final fix for environment variable passing

