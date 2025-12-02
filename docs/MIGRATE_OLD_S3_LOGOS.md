# Migrate Old S3 Logos to Supabase

If you're seeing CORS errors with your logo, it's likely because you have an old logo stored in S3 that needs to be migrated to Supabase.

## Quick Fix

**Simply re-upload your logo in Settings:**

1. Go to **Settings** → **Branding** section
2. Click **Upload Logo** (or re-upload your existing logo)
3. The new logo will be automatically saved to Supabase storage (secured)

That's it! The old S3 logo will be replaced with a new Supabase-stored logo.

## Why This Happens

### Before (Old System)
- Logos were stored in AWS S3
- Required CORS configuration
- Public URLs that could break

### After (New System)
- Logos are stored in Supabase Storage
- No CORS issues
- Secured with authentication
- Uses signed URLs

## Detection

The app automatically detects old S3 logos and shows a warning in the console:

```
🔴 Old S3 Logo Detected: Old S3 logo detected. Logos are now stored in Supabase. 
Please re-upload the logo in Settings to migrate to Supabase storage.
```

## Migration Steps

### Option 1: Re-upload (Recommended)
1. Go to Settings → Branding
2. Re-upload your logo
3. Done! Logo is now in Supabase

### Option 2: Manual Database Update (Advanced)

If you want to clean up old S3 URLs from the database:

```sql
-- Find old S3 logo URLs
SELECT 
  branding_id,
  system_logo,
  CASE 
    WHEN system_logo LIKE '%s3.%' OR system_logo LIKE '%amazonaws.com%' 
    THEN 'S3 URL - needs migration'
    ELSE 'OK'
  END as status
FROM company_branding
WHERE system_logo IS NOT NULL;

-- Clear old S3 URLs (optional - only if you've re-uploaded)
UPDATE company_branding
SET system_logo = NULL
WHERE system_logo LIKE '%s3.%' 
   OR system_logo LIKE '%amazonaws.com%';
```

**Note:** Only clear the URL if you've already re-uploaded the logo to Supabase!

## Verification

After re-uploading, verify the logo is in Supabase:

```sql
-- Check logo is in Supabase storage
SELECT 
  id,
  file_name,
  category,
  bucket,
  is_public,
  metadata->>'secured' as secured,
  created_at
FROM file_metadata
WHERE category = 'branding_logo'
ORDER BY created_at DESC
LIMIT 1;
```

Expected results:
- `bucket` should be `'branding'` (not `'s3'`)
- `is_public` should be `false`
- `metadata->>'secured'` should be `'true'`

## Troubleshooting

### Still seeing CORS errors?

1. **Clear browser cache** - Old URLs might be cached
2. **Check the URL** - Open browser DevTools → Network tab → Check the failing request
3. **Verify migration** - Run the verification query above
4. **Re-upload logo** - If still on S3, re-upload it

### Logo not showing after migration?

1. **Check authentication** - Make sure you're logged in
2. **Check bucket policies** - Run `docs/SECURE_BRANDING_BUCKET.sql` if not done
3. **Check signed URL expiration** - URLs expire after 1 hour, app should auto-refresh

## Related Documentation

- [LOGO_SECURITY_SETUP.md](./LOGO_SECURITY_SETUP.md) - How secured logos work
- [S3_CORS_SETUP.md](./S3_CORS_SETUP.md) - S3 CORS configuration (if you still need S3 for other files)

---

**Last Updated:** 2024-11-23

