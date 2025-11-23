# Understanding the CORS Error

## What is CORS?

**CORS (Cross-Origin Resource Sharing)** is a browser security feature that controls which websites can access resources from other domains.

### The Problem You're Seeing

```
Access to image at 'https://mana-smart-scent-files.s3.eu-north-1.amazonaws.com/...' 
from origin 'http://localhost:5173' 
has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## What's Happening?

### 1. **Your Browser's Request Flow**

```
┌─────────────────┐
│  Your App       │
│ localhost:5173  │
└────────┬────────┘
         │
         │ 1. Browser requests image from S3
         ▼
┌─────────────────────────────────────┐
│  AWS S3 Bucket                      │
│  mana-smart-scent-files              │
│  (eu-north-1)                       │
└────────┬────────────────────────────┘
         │
         │ 2. S3 sends image back
         │    BUT: No CORS headers!
         ▼
┌─────────────────┐
│  Your Browser   │
│  Security Check │
└────────┬────────┘
         │
         │ 3. Browser checks: "Does S3 allow localhost:5173?"
         │    Answer: NO (no CORS config = no permission)
         │
         ▼
    ❌ BLOCKED!
```

### 2. **Why the Browser Blocks It**

When your app at `http://localhost:5173` tries to load an image from `https://mana-smart-scent-files.s3.eu-north-1.amazonaws.com`, the browser checks:

1. **Is this a cross-origin request?** ✅ YES
   - Different protocol: `http://` vs `https://`
   - Different domain: `localhost:5173` vs `s3.eu-north-1.amazonaws.com`

2. **Does S3 allow this origin?** ❌ NO
   - S3 doesn't send `Access-Control-Allow-Origin: http://localhost:5173`
   - This means S3 hasn't been configured to allow your localhost

3. **Result:** Browser blocks the request for security

### 3. **What the Error Means**

```
No 'Access-Control-Allow-Origin' header is present
```

This means:
- S3 received your request
- S3 sent the image back
- BUT S3 didn't include the special header that says "yes, localhost:5173 is allowed"
- Browser sees no permission → blocks the image

## Why Can't You Fix This in Code?

**This is NOT a code problem - it's an AWS configuration problem.**

### What You CAN'T Do:
- ❌ Add headers in your React code
- ❌ Fix it with JavaScript
- ❌ Work around it with fetch options
- ❌ Change it in your frontend

### What You MUST Do:
- ✅ Configure CORS on the S3 bucket in AWS
- ✅ This is a server-side (S3) configuration
- ✅ Only AWS can add the `Access-Control-Allow-Origin` header

## The Solution: Configure CORS on S3

### What CORS Configuration Does

When you configure CORS on S3, you're telling S3:

> "When someone requests a file from these origins (like localhost:5173), 
> include the Access-Control-Allow-Origin header in your response."

### After Configuration

```
┌─────────────────┐
│  Your App       │
│ localhost:5173  │
└────────┬────────┘
         │
         │ 1. Browser requests image
         ▼
┌─────────────────────────────────────┐
│  AWS S3 Bucket                      │
│  (with CORS configured)             │
└────────┬────────────────────────────┘
         │
         │ 2. S3 sends image + CORS headers:
         │    Access-Control-Allow-Origin: http://localhost:5173
         ▼
┌─────────────────┐
│  Your Browser   │
│  Security Check │
└────────┬────────┘
         │
         │ 3. Browser checks: "Does S3 allow localhost:5173?"
         │    Answer: YES! (header is present)
         │
         ▼
    ✅ ALLOWED! Image loads!
```

## Step-by-Step Fix

### Option 1: Quick Fix with AWS CLI (Recommended)

If you have AWS CLI installed:

```powershell
# 1. Make sure AWS CLI is configured
aws configure

# 2. Run the automation script
.\scripts\configure-s3-cors.ps1
```

### Option 2: Manual Fix via AWS Console

1. **Go to AWS S3 Console**
   - Visit: https://s3.console.aws.amazon.com/
   - Sign in with your AWS account

2. **Find Your Bucket**
   - Click on: `mana-smart-scent-files`
   - Make sure you're in region: `eu-north-1`

3. **Open Permissions Tab**
   - Click the **Permissions** tab
   - Scroll down to **Cross-origin resource sharing (CORS)**

4. **Edit CORS Configuration**
   - Click **Edit**
   - Delete any existing configuration
   - Paste this JSON:   

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
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

5. **Save Changes**
   - Click **Save changes**
   - Wait 1-2 minutes for propagation

6. **Test**
   - Clear browser cache (Ctrl+Shift+Delete)
   - Or use incognito mode
   - Refresh your app

## Understanding the CORS Configuration

### AllowedOrigins
```json
"AllowedOrigins": ["http://localhost:5173", ...]
```
**What it means:** These are the websites allowed to access your S3 bucket.

**Important:**
- ✅ `http://localhost:5173` (correct - no trailing slash)
- ❌ `http://localhost:5173/` (wrong - trailing slash breaks it)
- ✅ Must match EXACTLY (protocol, domain, port)

### AllowedMethods
```json
"AllowedMethods": ["GET", "HEAD"]
```
**What it means:** Only GET and HEAD requests are allowed (reading files, not uploading).

### AllowedHeaders
```json
"AllowedHeaders": ["*"]
```
**What it means:** All request headers are allowed (most permissive setting).

### ExposeHeaders
```json
"ExposeHeaders": ["ETag", "Content-Length", ...]
```
**What it means:** These response headers can be read by JavaScript in your browser.

## Common Questions

### Q: Why does it work with pre-signed URLs?
**A:** Pre-signed URLs don't bypass CORS - they still need CORS configured. The URL signature just gives permission to access the file, but CORS controls which origins can make the request.

### Q: Can I use `*` for AllowedOrigins?
**A:** Yes, but it's **NOT recommended for production** because it allows ANY website to access your files. Only use `*` for development.

### Q: How long does it take to work?
**A:** Usually 1-2 minutes after saving, but can take up to 5 minutes for global propagation.

### Q: Why do I need to clear cache?
**A:** Browsers cache CORS preflight responses. Clearing cache forces a fresh check.

### Q: Can I test CORS without the browser?
**A:** Yes, using curl:
```bash
curl -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET" \
     -v \
     https://mana-smart-scent-files.s3.eu-north-1.amazonaws.com/your-file.jpg
```
Look for `Access-Control-Allow-Origin` in the response headers.

## Visual Summary

### Before CORS Configuration:
```
Browser → S3: "Give me image.jpg"
S3 → Browser: "Here's image.jpg" (no CORS header)
Browser: "No permission header? BLOCKED! ❌"
```

### After CORS Configuration:
```
Browser → S3: "Give me image.jpg"
S3 → Browser: "Here's image.jpg + Access-Control-Allow-Origin: http://localhost:5173"
Browser: "Permission granted! ✅ Image loads!"
```

## Next Steps

1. ✅ Apply CORS configuration to your S3 bucket
2. ✅ Wait 1-2 minutes
3. ✅ Clear browser cache
4. ✅ Refresh your app
5. ✅ Images should now load!

---

**Need Help?**
- See [S3_CORS_SETUP.md](./S3_CORS_SETUP.md) for detailed setup instructions
- Run `.\scripts\configure-s3-cors.ps1` for automated setup
- Check AWS S3 CORS documentation: https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html

