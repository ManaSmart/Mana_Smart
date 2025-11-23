# S3 CORS Configuration Guide

This guide explains how to configure CORS (Cross-Origin Resource Sharing) for your AWS S3 bucket to allow your frontend application to load images and files.

## Problem

If you're seeing errors like:
```
Access to image at 'https://your-bucket.s3.region.amazonaws.com/...' from origin 'http://localhost:5173' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**This means your S3 bucket doesn't have CORS configured to allow requests from your frontend domain.**

**This is an AWS configuration issue that MUST be fixed in the AWS S3 Console - it cannot be fixed in code.**

**Your bucket name:** `mana-smart-scent-files`  
**Your region:** `eu-north-1`  
**Your current origin:** `http://localhost:5173`

## Solution: Configure CORS on S3 Bucket

### Option A: Quick Setup with AWS CLI (Recommended)

If you have AWS CLI installed and configured, you can apply the CORS configuration automatically:

1. **Run the configuration script:**
   ```powershell
   .\scripts\configure-s3-cors.ps1
   ```

2. **Or manually with AWS CLI:**
   ```powershell
   aws s3api put-bucket-cors --bucket mana-smart-scent-files --region eu-north-1 --cors-configuration file://scripts/s3-cors-config.json
   ```

3. **Verify the configuration:**
   ```powershell
   aws s3api get-bucket-cors --bucket mana-smart-scent-files --region eu-north-1
   ```

**Note:** Make sure AWS CLI is installed and configured with your credentials (`aws configure`).

### Option B: Manual Setup via AWS Console

### Step 1: Open AWS S3 Console

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click on your bucket name (e.g., `mana-smart-scent-files`)

### Step 2: Navigate to Permissions Tab

1. Click on the **Permissions** tab
2. Scroll down to **Cross-origin resource sharing (CORS)**
3. Click **Edit**

### Step 3: Add CORS Configuration

**⚠️ IMPORTANT: Copy the EXACT configuration below for your bucket `mana-smart-scent-files`:**

**Quick Copy:** You can also copy the configuration from `scripts/s3-cors-config.json` file.

Paste the following CORS configuration JSON into the editor:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "HEAD"
        ],
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

**⚠️ CRITICAL CHECKLIST:**
- ✅ Copy the ENTIRE JSON array (including the square brackets `[` and `]`)
- ✅ Make sure `http://localhost:5173` is included (your current development URL)
- ✅ NO trailing slashes in any origin (e.g., `http://localhost:5173` NOT `http://localhost:5173/`)
- ✅ Replace `https://your-production-domain.com` with your actual production domain if different

### Step 4: Customize for Your Environment

**Important:** Replace the `AllowedOrigins` with your actual domains:

- **Development:** Add your localhost URLs (e.g., `http://localhost:5173`)
- **Production:** Add your production domain (e.g., `https://yourdomain.com`)
- **Staging:** Add your staging domain if applicable
- **⚠️ CRITICAL: NO TRAILING SLASHES** - Origins must NOT end with `/`

**Example for multiple environments:**
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": [
            "http://localhost:5173",
            "http://localhost:3000",
            "https://mana-smart-scent.com",
            "https://www.mana-smart-scent.com",
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

**⚠️ Common Mistake:** 
- ❌ `"https://mana-smart-scent.vercel.app/"` (with trailing slash - WRONG)
- ✅ `"https://mana-smart-scent.vercel.app"` (without trailing slash - CORRECT)

### Step 5: Save Changes

1. **Double-check your JSON is valid** - it should be an array with one object inside
2. Click **Save changes**
3. **Wait 1-2 minutes** for the changes to propagate globally
4. **Clear your browser cache** or use incognito mode
5. **Refresh your application** - the CORS errors should disappear

### Step 6: Verify CORS Configuration

After saving, you can verify the CORS configuration by:

1. **Using AWS CLI:**
   ```bash
   aws s3api get-bucket-cors --bucket your-bucket-name
   ```

2. **Using Browser DevTools:**
   - Open your application
   - Try loading an image
   - Check the Network tab - the response should include `Access-Control-Allow-Origin` header

## Alternative: Allow All Origins (Not Recommended for Production)

⚠️ **Security Warning:** Only use this for development or if you truly need to allow all origins.

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": ["*"],
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

## Understanding CORS Configuration

- **AllowedHeaders:** Headers that the browser is allowed to send (use `["*"]` for all)
- **AllowedMethods:** HTTP methods allowed (GET and HEAD for reading files)
- **AllowedOrigins:** Domains that can access your S3 bucket (your frontend URLs)
- **ExposeHeaders:** Headers that the browser can read from the response
- **MaxAgeSeconds:** How long the browser can cache the CORS preflight response (3600 = 1 hour)

## Troubleshooting

### CORS Still Not Working?

1. **Clear Browser Cache:** CORS preflight responses are cached. Clear your browser cache or use incognito mode.

2. **Check Bucket Region:** Make sure you're editing the CORS configuration for the correct bucket in the correct region.

3. **Verify Origins Match Exactly:** 
   - `http://localhost:5173` ≠ `http://localhost:5173/` (trailing slash matters)
   - `http://` ≠ `https://` (protocol matters)

4. **Wait for Propagation:** S3 CORS changes can take a few minutes to propagate globally.

5. **Check Browser Console:** Look for specific CORS error messages that indicate what's missing.

### Common Errors

**Error: "No 'Access-Control-Allow-Origin' header"**
- Solution: CORS is not configured or your origin is not in the AllowedOrigins list

**Error: "Method GET is not allowed"**
- Solution: Add `"GET"` to the AllowedMethods array

**Error: "Request header field X-Custom-Header is not allowed"**
- Solution: Add the header to AllowedHeaders or use `["*"]` for all headers

## Testing CORS Configuration

You can test if CORS is working using curl:

```bash
curl -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     -v \
     https://your-bucket.s3.region.amazonaws.com/your-file.jpg
```

Look for `Access-Control-Allow-Origin` in the response headers.

## Security Best Practices

1. **Never use `"*"` for AllowedOrigins in production** - always specify your exact domains
2. **Use HTTPS in production** - add both `http://` and `https://` versions if needed during migration
3. **Limit AllowedMethods** - only include methods you actually need (GET, HEAD for reading)
4. **Set appropriate MaxAgeSeconds** - balance between performance and flexibility

## Related Documentation

- [S3_BUCKET_POLICY_SETUP.md](./S3_BUCKET_POLICY_SETUP.md) - Bucket policy configuration (may be needed in addition to CORS)
- [AWS S3 CORS Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)
- [MDN CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [FILE_STORAGE_SETUP.md](./FILE_STORAGE_SETUP.md) - General file storage setup

## Quick Reference

**Minimum CORS Configuration for Image Loading:**
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": ["http://localhost:5173", "https://yourdomain.com"],
        "ExposeHeaders": ["ETag", "Content-Length"],
        "MaxAgeSeconds": 3600
    }
]
```

---

**Last Updated:** 2024-11-23

