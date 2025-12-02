# Logo Security Setup Guide

This guide explains how logos are now secured in Supabase storage with private access and secured metadata flags.

## Overview

Logos are now:
- ✅ **Stored in Supabase Storage** (not S3) - always uses Supabase regardless of `VITE_STORAGE_PROVIDER`
- ✅ **Private/Secured** - no public access, requires authentication
- ✅ **Marked with secured flag** - metadata includes `secured: true`
- ✅ **Use signed URLs** - temporary URLs that expire (default: 1 hour)

## Changes Made

### 1. New Upload Function

A new function `uploadLogoToSupabase()` was created that:
- Forces Supabase storage (bypasses `VITE_STORAGE_PROVIDER` setting)
- Sets `isPublic: false` (makes logos private)
- Adds `secured: true` to metadata
- Always uses the `branding` bucket

### 2. Updated Settings Component

The logo upload in `Settings.tsx` now:
- Uses `uploadLogoToSupabase()` instead of `uploadFile()`
- Handles signed URLs instead of public URLs
- Automatically refreshes expired URLs

### 3. Secure Bucket Configuration

The branding bucket is now:
- **Private** (`public: false`)
- **RLS Protected** - only authenticated users can access
- **No public read access** - all access requires authentication

## Setup Instructions

### Step 1: Run SQL Script

Run the SQL script to secure the branding bucket:

```sql
-- See docs/SECURE_BRANDING_BUCKET.sql
```

Or run it directly in Supabase SQL Editor:

1. Go to Supabase Dashboard → SQL Editor
2. Open `docs/SECURE_BRANDING_BUCKET.sql`
3. Copy and paste the entire script
4. Click "Run"

### Step 2: Verify Bucket is Private

Check that the bucket is now private:

```sql
SELECT id, name, public 
FROM storage.buckets 
WHERE id = 'branding';
```

Expected result: `public = false`

### Step 3: Verify Policies

Check that RLS policies are in place:

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%branding%';
```

Expected: 4 policies (SELECT, INSERT, UPDATE, DELETE)

## How It Works

### Uploading Logos

1. User uploads logo in Settings
2. `uploadLogoToSupabase()` is called
3. Logo is uploaded to Supabase `branding` bucket (private)
4. Metadata is created with `secured: true` flag
5. Signed URL is generated (valid for 1 hour)
6. Logo URL is stored in `company_branding.system_logo`

### Loading Logos

1. App loads branding data
2. Finds logo file in `file_metadata` table
3. Checks if file is secured (from metadata)
4. Generates signed URL (if expired, creates new one)
5. Displays logo using signed URL

### URL Refresh

Signed URLs expire after 1 hour. The app automatically:
- Detects expired URLs
- Generates new signed URLs
- Updates the displayed logo

## Security Benefits

### Before (Public Logos)
- ❌ Logos were publicly accessible
- ❌ Anyone with the URL could access logos
- ❌ No authentication required
- ❌ Stored in S3 (external dependency)

### After (Secured Logos)
- ✅ Logos require authentication
- ✅ Only authenticated users can access
- ✅ URLs expire after 1 hour
- ✅ Stored in Supabase (integrated)
- ✅ Marked with `secured: true` in metadata

## Metadata Structure

When a logo is uploaded, the metadata includes:

```json
{
  "secured": true,
  "uploaded_via": "supabase_storage"
}
```

You can check this in the `file_metadata` table:

```sql
SELECT 
  id,
  file_name,
  category,
  bucket,
  is_public,
  metadata
FROM file_metadata
WHERE category = 'branding_logo'
ORDER BY created_at DESC
LIMIT 5;
```

## Troubleshooting

### Logo Not Loading?

1. **Check authentication**: User must be logged in
2. **Check bucket policies**: Run verification queries above
3. **Check signed URL expiration**: URLs expire after 1 hour
4. **Check browser console**: Look for storage errors

### "Access Denied" Errors?

1. Verify bucket is private: `SELECT public FROM storage.buckets WHERE id = 'branding';`
2. Verify RLS policies exist (see Step 3 above)
3. Check user is authenticated: `auth.role() = 'authenticated'`

### URLs Expiring Too Fast?

The default expiration is 1 hour. To change it, modify the `getFileUrl()` call in `Settings.tsx`:

```typescript
const logoUrl = await getFileUrl(
  logoFile.bucket as any,
  logoFile.path,
  false, // isPublic
  7200  // expiresIn: 2 hours (in seconds)
);
```

## Migration from Public Logos

If you have existing public logos:

1. **Run the SQL script** to secure the bucket
2. **Re-upload logos** to mark them as secured
3. **Update existing metadata** (optional):

```sql
-- Mark existing logos as secured
UPDATE file_metadata
SET 
  is_public = false,
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"secured": true, "migrated": true}'::jsonb
WHERE category = 'branding_logo';
```

## Related Documentation

- [FILE_STORAGE_SETUP.md](./FILE_STORAGE_SETUP.md) - General file storage setup
- [STORAGE_BUCKETS_SETUP.sql](./STORAGE_BUCKETS_SETUP.sql) - Bucket creation
- [FIX_ALL_RLS_ISSUES.sql](./FIX_ALL_RLS_ISSUES.sql) - RLS policy fixes

---

**Last Updated:** 2024-11-23

