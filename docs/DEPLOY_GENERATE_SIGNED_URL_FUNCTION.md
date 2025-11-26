# Deploy generate-signed-url Edge Function

## Overview

The `generate-signed-url` Edge Function generates pre-signed S3 URLs for downloading backups. This function must be deployed to Supabase for the backup download feature to work.

## Deployment Steps

### Step 1: Deploy the Function

```bash
# Navigate to your project root
cd /path/to/Mana_Smart_Scent

# Deploy the function (use --no-verify-jwt because we use custom auth)
supabase functions deploy generate-signed-url --no-verify-jwt
```

**Why `--no-verify-jwt`?**
- The function uses custom authentication (user_id verification)
- Not Supabase's built-in JWT auth
- This allows the function to work with your custom auth system

### Step 2: Set Required Secrets

The function needs these environment variables (secrets):

```bash
# AWS S3 Configuration
supabase secrets set AWS_ACCESS_KEY_ID=your_aws_access_key
supabase secrets set AWS_SECRET_ACCESS_KEY=your_aws_secret_key
supabase secrets set AWS_S3_REGION=your_s3_region  # e.g., us-east-1
supabase secrets set AWS_S3_BUCKET=your_s3_bucket_name

# Supabase Configuration
supabase secrets set SUPABASE_URL=https://rqssjgiunwyjeyutgkkp.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**To get your secrets:**
- AWS credentials: AWS Console → IAM → Users → Your User → Security Credentials
- S3 Region: Check your S3 bucket settings
- S3 Bucket: Your bucket name
- Supabase URL: Supabase Dashboard → Settings → API → Project URL
- Service Role Key: Supabase Dashboard → Settings → API → service_role key (keep this secret!)

### Step 3: Configure CORS in Supabase Dashboard

**IMPORTANT:** You must also configure CORS in the Supabase dashboard:

1. Go to your Supabase Dashboard
2. Navigate to **Settings** → **API**
3. Scroll down to **CORS Configuration**
4. Add your origins:
   - `http://localhost:5173` (for local development)
   - `https://console-mana.com` (your production domain)
   - `https://www.console-mana.com` (your production domain with www)
   - `https://mana-smart-scent.vercel.app` (if using Vercel)
5. Click **Save**

### Step 4: Verify Deployment

1. **Check Function Status:**
   - Go to Supabase Dashboard → **Edge Functions**
   - Verify `generate-signed-url` is listed and shows "Active"

2. **Test the Function:**
   ```bash
   curl -X OPTIONS https://rqssjgiunwyjeyutgkkp.supabase.co/functions/v1/generate-signed-url \
     -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: content-type,authorization" \
     -v
   ```
   
   This should return `200 OK` with CORS headers.

3. **Test with POST (requires authentication):**
   ```bash
   curl -X POST https://rqssjgiunwyjeyutgkkp.supabase.co/functions/v1/generate-signed-url \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "apikey: YOUR_ANON_KEY" \
     -d '{"user_id": "your-user-id", "s3_key": "backups/2025/11/26/backup-2025-11-26-11-30-UTC.zip"}'
   ```

### Step 5: Troubleshooting CORS Issues

If you're still getting CORS errors:

1. **Verify Function is Deployed:**
   - Check Supabase Dashboard → Edge Functions
   - Look for `generate-signed-url` in the list
   - Check function logs for errors

2. **Check CORS Configuration:**
   - Supabase Dashboard → Settings → API → CORS
   - Ensure your origin is in the allowed list
   - Save and wait a few minutes for changes to propagate

3. **Verify Function Code:**
   - The function should handle OPTIONS requests first
   - Check function logs in Supabase Dashboard

4. **Test OPTIONS Request:**
   ```bash
   # This should return 200 OK
   curl -X OPTIONS https://rqssjgiunwyjeyutgkkp.supabase.co/functions/v1/generate-signed-url \
     -H "Origin: http://localhost:5173" \
     -v
   ```

5. **Check Browser Console:**
   - Open browser DevTools (F12)
   - Check Network tab
   - Look for the OPTIONS request
   - Verify it returns 200 status

### Common Issues

**Issue: "Response to preflight request doesn't pass access control check"**
- **Solution:** Configure CORS in Supabase Dashboard (Step 3)
- **Solution:** Ensure function is deployed with `--no-verify-jwt`
- **Solution:** Check that OPTIONS handler returns 200 status

**Issue: "Function not found"**
- **Solution:** Verify function is deployed: `supabase functions list`
- **Solution:** Check function name matches exactly: `generate-signed-url`

**Issue: "Authentication required"**
- **Solution:** Ensure you're logged in (user_id in localStorage)
- **Solution:** Check that user exists in `system_users` table

**Issue: "Missing s3_key parameter"**
- **Solution:** Ensure backup has `s3_key` set in `backup_history` table
- **Solution:** Check that backup completed successfully

## How It Works

1. **User clicks download** → Frontend calls `generateSignedUrl(s3Key)`
2. **Frontend sends request** → To Edge Function with `user_id` and `s3_key`
3. **Edge Function verifies** → Checks user exists and is active
4. **Edge Function generates** → Pre-signed S3 URL (valid 15 minutes)
5. **Frontend receives URL** → Opens download in new tab

## Security

- ✅ Requires user authentication (user_id verification)
- ✅ Verifies user exists and is active
- ✅ Uses pre-signed URLs (expire after 15 minutes)
- ✅ Only allows access to backups (S3 keys are validated)

---

**Status:** Ready to deploy. Follow all steps above, especially Step 3 (CORS configuration)!

