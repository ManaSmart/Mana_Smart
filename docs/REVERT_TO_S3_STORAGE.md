# Reverted to S3 Storage for Logos

## Changes Made

1. **Updated `uploadLogoToS3()` function** in `src/lib/storage.ts`:
   - Changed from `uploadLogoToSupabase()` to `uploadLogoToS3()`
   - Now uses S3 storage with presigned URLs (7-day expiration for logos)
   - Logos are stored in S3 bucket with path: `branding/logos/filename.png`

2. **Updated Settings component** in `src/components/Settings.tsx`:
   - Changed import from `uploadLogoToSupabase` to `uploadLogoToS3`
   - Updated upload call to use `uploadLogoToS3()`

## CORS Configuration - ⚠️ REQUIRED FOR UPLOADS

**IMPORTANT**: The CORS configuration has been updated to include **PUT** and **POST** methods for uploads. You MUST apply this configuration to your S3 bucket.

CORS configuration is in `scripts/s3-cors-config.json`. To apply it:

### Option 1: AWS Console (Easiest - Recommended)
1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Select bucket: `mana-smart-scent-files`
3. Go to **Permissions** tab
4. Scroll to **Cross-origin resource sharing (CORS)**
5. Click **Edit**
6. **Delete** any existing configuration
7. **Paste** the entire contents of `scripts/s3-cors-config.json`:
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD", "PUT", "POST"],
        "AllowedOrigins": [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "https://mana-smart-scent.vercel.app",
            "https://console-mana.com"
        ],
        "ExposeHeaders": [
            "ETag",
            "Content-Length",
            "Content-Type",
            "Last-Modified"
        ],
        "MaxAgeSeconds": 3600
    }
]
```
8. Click **Save changes**
9. **Wait 1-2 minutes** for changes to propagate
10. **Clear browser cache** or use incognito mode

### Option 2: AWS CLI (If installed)
```powershell
aws s3api put-bucket-cors --bucket mana-smart-scent-files --region eu-north-1 --cors-configuration file://scripts/s3-cors-config.json
```

### Option 3: PowerShell Script (If AWS CLI is installed)
```powershell
.\scripts\configure-s3-cors.ps1
```

## Updated CORS Configuration

The CORS config now allows:
- **Origins**: localhost:5173, localhost:5174, localhost:3000, and production domains
- **Methods**: GET, HEAD, **PUT**, **POST** (PUT and POST are required for uploads!)
- **Headers**: All headers (`*`)
- **MaxAge**: 3600 seconds (1 hour)

**⚠️ Without PUT and POST methods, file uploads will fail with CORS errors!**

## Benefits of S3 Storage

1. ✅ **Reliable**: No timing issues with file availability
2. ✅ **Fast**: Direct S3 access with presigned URLs
3. ✅ **Long expiration**: Logos use 7-day presigned URLs (vs 1 hour for Supabase)
4. ✅ **No RLS issues**: S3 doesn't have RLS policy complications
5. ✅ **Better for production**: More stable and predictable

## Troubleshooting

If you still see CORS errors:

1. **Verify CORS is applied**:
   ```powershell
   aws s3api get-bucket-cors --bucket mana-smart-scent-files --region eu-north-1
   ```

2. **Clear browser cache** or use incognito mode

3. **Wait 1-2 minutes** for CORS changes to propagate

4. **Check the origin** matches exactly (no trailing slashes, correct protocol)

5. **Verify your domain** is in the AllowedOrigins list

## File Paths

Logos are stored at:
- S3 Path: `branding/logos/filename.png`
- Full URL: `https://mana-smart-scent-files.s3.eu-north-1.amazonaws.com/branding/logos/filename.png?[presigned-params]`

## Next Steps

1. Apply CORS configuration using one of the methods above
2. Test logo upload - it should work immediately
3. Verify logo displays correctly in the application

