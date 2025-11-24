# AWS S3 CORS Configuration Guide

This document provides the correct CORS configuration for your S3 bucket to allow your frontend to fetch images without errors.

## Quick Setup Steps

1. Go to AWS S3 Console → Select your bucket (`mana-smart-scent-files` or your bucket name)
2. Click **"Permissions"** tab
3. Scroll down to **"Cross-origin resource sharing (CORS)"**
4. Click **"Edit"**
5. Paste the following CORS configuration:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "HEAD",
            "PUT",
            "POST",
            "DELETE"
        ],
        "AllowedOrigins": [
            "http://localhost:5173",
            "https://localhost:5173",
            "https://console-mana.com",
            "http://console-mana.com",
            "https://*.console-mana.com",
            "http://*.console-mana.com"
        ],
        "ExposeHeaders": [
            "ETag",
            "x-amz-server-side-encryption",
            "x-amz-request-id",
            "x-amz-id-2",
            "Content-Length",
            "Content-Type"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

## Important Notes

- **AllowedOrigins**: Add your production domain(s) to this list. The wildcard `*.console-mana.com` covers subdomains.
- **AllowedMethods**: Includes all methods needed for file operations.
- **MaxAgeSeconds**: 3000 seconds (50 minutes) - browsers will cache CORS preflight responses.
- **ExposeHeaders**: Required headers for signed URL operations.

## After Configuration

1. Click **"Save changes"**
2. Wait 1-2 minutes for changes to propagate
3. Clear your browser cache
4. Test the logo upload/display functionality

## Troubleshooting

If you still see CORS errors:

1. Verify the bucket name matches your environment variable `VITE_AWS_S3_BUCKET`
2. Check that your domain is in the `AllowedOrigins` list
3. Ensure there are no typos in the CORS configuration JSON
4. Try accessing the bucket from a different browser/incognito mode
5. Check AWS CloudWatch logs for detailed error messages

## Production Domains

For production, add your actual domain(s) to `AllowedOrigins`:

```json
"AllowedOrigins": [
    "http://localhost:5173",
    "https://localhost:5173",
    "https://console-mana.com",
    "http://console-mana.com",
    "https://your-production-domain.com",
    "http://your-production-domain.com"
]
```

Replace `your-production-domain.com` with your actual Hostinger domain.
