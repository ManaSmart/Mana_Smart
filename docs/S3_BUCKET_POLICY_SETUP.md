# S3 Bucket Policy Configuration Guide

This guide explains how to configure your S3 bucket policy to work with CORS and pre-signed URLs.

## ⚠️ Important: Do You Need a Bucket Policy?

**If you're using pre-signed URLs (which you are), you typically DON'T need a bucket policy!**

- **Pre-signed URLs** work with CORS configuration alone
- **Bucket policies** are only needed for public access without pre-signed URLs
- **Block Public Access** settings prevent public bucket policies (this is good for security)

**For your use case (pre-signed URLs), you only need:**
1. ✅ CORS configuration (already done)
2. ❌ Bucket policy (NOT needed)

Only configure a bucket policy if you want public access without pre-signed URLs.

## Problem

Even with CORS configured, you might still get errors if the bucket policy doesn't allow the necessary operations. However, this is usually a CORS issue, not a bucket policy issue.

## When Do You Need a Bucket Policy?

You only need a bucket policy if:
- You want public access to files without pre-signed URLs
- You're not using pre-signed URLs
- You want to allow direct public access to specific paths

**If you're using pre-signed URLs (recommended), skip this guide and just configure CORS.**

## Solution: Configure Bucket Policy (Only if Needed)

⚠️ **Before proceeding:** Make sure you actually need a bucket policy. If you're using pre-signed URLs, you don't need this!

### Step 1: Disable Block Public Access (If Using Public Policy)

If you want to use a public bucket policy, you need to disable specific Block Public Access settings:

1. Go to AWS S3 Console → Your bucket
2. Click **Permissions** tab
3. Scroll to **Block Public Access settings**
4. Click **Edit**

**For public read access via bucket policy (specific paths only):**

✅ **KEEP ENABLED (Checked):**
- ✅ Block public access to buckets and objects granted through new access control lists (ACLs)
- ✅ Block public access to buckets and objects granted through any access control lists (ACLs)

❌ **DISABLE (Uncheck):**
- ❌ Block public access to buckets and objects granted through new public bucket or access point policies
- ❌ Block public and cross-account access to buckets and objects through any public bucket or access point policies

**Why:**
- Keep ACL settings enabled because you're not using ACLs (more secure)
- Disable policy settings because you need bucket policies to grant public read access
- This allows your bucket policy to work while still blocking ACL-based public access

5. Click **Save changes**
6. Type `confirm` to confirm

⚠️ **Security Warning:** 
- Only disable these settings if you truly need public access via bucket policy
- For pre-signed URLs (recommended), keep ALL settings enabled
- If you disable these, make sure your bucket policy only allows access to specific paths (e.g., `branding/*`)

### Step 2: Open AWS S3 Console

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
2. Click on your bucket name (e.g., `mana-smart-scent-files`)

### Step 3: Navigate to Permissions Tab

1. Click on the **Permissions** tab
2. Scroll down to **Bucket policy**
3. Click **Edit**

### Step 4: Add Bucket Policy

Paste the following bucket policy (replace `your-bucket-name` with your actual bucket name):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowPublicRead",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-bucket-name/*"
        },
        {
            "Sid": "AllowCORS",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-bucket-name/*",
            "Condition": {
                "StringEquals": {
                    "s3:ExistingObjectTag/Public": "true"
                }
            }
        }
    ]
}
```

**OR** for a simpler approach that works with pre-signed URLs:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowPublicReadForPresignedUrls",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-bucket-name/*"
        }
    ]
}
```

⚠️ **Security Note:** The second policy allows public read access to all objects. If you need more security, use the first policy with object tagging, or restrict by path prefix.

### Step 5: Restrict by Path (Recommended for Security)

If you want to allow public read only for specific paths (like branding logos):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowPublicReadForBranding",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-bucket-name/branding/*"
        }
    ]
}
```

### Step 6: Save Changes

1. Click **Save changes**
2. Wait a few seconds for changes to propagate

## Verify Configuration

After configuring both CORS and bucket policy:

1. **Clear browser cache** (CORS responses are cached)
2. **Test in incognito/private window**
3. **Check browser console** for CORS errors
4. **Verify the image loads** without errors

## Common Issues

### Issue: Still Getting CORS Errors

**Solution 1: Check Origin Match**
- Remove trailing slashes from origins in CORS config
- `https://mana-smart-scent.vercel.app/` ❌ (has trailing slash)
- `https://mana-smart-scent.vercel.app` ✅ (no trailing slash)

**Solution 2: Clear Browser Cache**
- CORS preflight responses are cached
- Clear cache or use incognito mode

**Solution 3: Wait for Propagation**
- S3 changes can take 1-2 minutes to propagate globally
- Try again after waiting

**Solution 4: Check Bucket Policy**
- Ensure bucket policy allows `s3:GetObject` (this covers both GET and HEAD requests)
- Verify the resource ARN matches your bucket name
- Note: `s3:HeadObject` is not a separate action - `s3:GetObject` covers it

### Issue: Pre-signed URLs Not Working

**Solution:**
- Pre-signed URLs should work even without public bucket policy
- But CORS must be configured correctly
- Check that your CORS config includes the correct origin

## Security Best Practices

1. **Use Path Restrictions:** Only allow public read for specific paths (e.g., `branding/*`)
2. **Use CloudFront:** Consider using CloudFront as a CDN with proper CORS headers
3. **Monitor Access:** Enable S3 access logging to monitor who's accessing your files
4. **Use IAM Policies:** For production, use IAM policies instead of public bucket policies

## Related Documentation

- [S3_CORS_SETUP.md](./S3_CORS_SETUP.md) - CORS configuration
- [AWS S3 Bucket Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html)
- [AWS S3 CORS Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)

---

**Last Updated:** 2024-11-23

