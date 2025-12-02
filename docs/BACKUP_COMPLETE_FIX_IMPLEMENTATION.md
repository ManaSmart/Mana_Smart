# Backup Complete Fix - Implementation Guide

This document describes the complete fix for the backup system to ensure backups are properly tracked and downloadable.

## Problem Summary

1. Worker uploads file to S3 but never returns the S3 key
2. Supabase `backup_history` table is never updated with `s3_key` or `status = 'completed'`
3. Frontend remains in spinner because poll never sees the update
4. Download button never shows because `s3_key` is null
5. Need "Send via WhatsApp" and "Send via Email" once backup completes

## Solution Overview

### 1. Database Migration

Run the migration to add `finished_at` column:

```sql
-- File: supabase/migrations/008_add_finished_at_to_backup_history.sql
ALTER TABLE backup_history 
ADD COLUMN IF NOT EXISTS finished_at timestamptz;
```

### 2. New Edge Functions

#### `update-backup` Function
- **Purpose**: Updates `backup_history` table with `s3_key`, `status`, and `finished_at`
- **Called by**: GitHub Actions workflow after uploading to S3
- **Location**: `supabase/functions/update-backup/index.ts`

**Usage from GitHub Actions:**
```bash
curl -X POST "${SUPABASE_URL}/functions/v1/update-backup" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "backup_id": "'"${BACKUP_ID}"'",
    "dispatch_id": "'"${DISPATCH_ID}"'",
    "s3_key": "backups/'"${BACKUP_ID}"'.zip",
    "status": "success",
    "size_bytes": '"${FILE_SIZE}"'
  }'
```

#### `download-backup` Function
- **Purpose**: Generates signed S3 URL for downloading backups
- **Location**: `supabase/functions/download-backup/index.ts`
- **Usage**: Frontend calls this to get download URLs

### 3. Updated Share Function

The `share-backup` function now supports:
- **Email**: SendGrid, AWS SES, or custom email service
- **WhatsApp**: Twilio WhatsApp API or fallback to WhatsApp web link

**Environment Variables Required:**
- For Email: `SENDGRID_API_KEY` OR `AWS_SES_*` credentials OR `EMAIL_SERVICE_URL`
- For WhatsApp: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (optional, falls back to web link)

### 4. GitHub Actions Workflow Update

**CRITICAL**: Update your GitHub Actions workflow (`.github/workflows/backup.yml`) to call `update-backup` after uploading to S3:

```yaml
- name: Upload backup to S3
  run: |
    # ... upload code ...
    S3_KEY="backups/${BACKUP_ID}.zip"
    aws s3 cp backup.zip "s3://${S3_BUCKET}/${S3_KEY}"
    
    # ✅ CRITICAL: Update backup_history after upload
    curl -X POST "${SUPABASE_URL}/functions/v1/update-backup" \
      -H "Authorization: Bearer ${BACKUP_API_KEY}" \
      -H "Content-Type: application/json" \
      -d '{
        "backup_id": "'"${BACKUP_ID}"'",
        "dispatch_id": "'"${DISPATCH_ID}"'",
        "s3_key": "'"${S3_KEY}"'",
        "status": "success",
        "size_bytes": '"$(stat -f%z backup.zip 2>/dev/null || stat -c%s backup.zip 2>/dev/null || echo 0)"'
      }'
    
    if [ $? -eq 0 ]; then
      echo "✅ Backup history updated successfully"
    else
      echo "❌ Failed to update backup history"
      exit 1
    fi
```

**Required Secrets in GitHub:**
- `SUPABASE_URL`: Your Supabase project URL
- `BACKUP_API_KEY`: API key for authenticating with update-backup function (set in Supabase Edge Function secrets)

### 5. Frontend Updates

The frontend (`BackupSettings.tsx`) has been updated to:
- Detect when backups have S3 keys even if status is still "in_progress"
- Refresh history more frequently when backups complete
- Stop background monitoring properly when backups complete
- Show download button when `s3_key` exists

### 6. API Client Updates

New functions in `src/lib/backupApi.ts`:
- `updateBackup()`: Updates backup history (called by workflow)
- `downloadBackup()`: Gets download URL for a backup

## Deployment Steps

1. **Run Database Migration:**
   ```bash
   # Apply migration via Supabase Dashboard SQL Editor or CLI
   psql $DATABASE_URL -f supabase/migrations/008_add_finished_at_to_backup_history.sql
   ```

2. **Deploy Edge Functions:**
   ```bash
   supabase functions deploy update-backup
   supabase functions deploy download-backup
   supabase functions deploy share-backup  # Updated version
   ```

3. **Set Environment Variables:**
   In Supabase Dashboard → Edge Functions → Secrets:
   - `BACKUP_API_KEY`: Generate a secure random string for API authentication
   - `SENDGRID_API_KEY` (optional): For email sending
   - `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (optional): For WhatsApp sending

4. **Update GitHub Actions Workflow:**
   - Add the `update-backup` API call after S3 upload
   - Add `BACKUP_API_KEY` to GitHub Secrets
   - Test the workflow

5. **Update Frontend:**
   - The frontend code is already updated
   - No additional configuration needed

## Testing

1. **Test Backup Creation:**
   - Trigger a manual backup
   - Verify workflow completes
   - Check that `backup_history` is updated with `s3_key` and `status = 'success'`
   - Verify download button appears

2. **Test Download:**
   - Click download button
   - Verify signed URL is generated and file downloads

3. **Test Sharing:**
   - Click share button
   - Test email sharing (if configured)
   - Test WhatsApp sharing (if configured)

## Troubleshooting

### Backup history not updating
- Check GitHub Actions logs for the `update-backup` API call
- Verify `BACKUP_API_KEY` is set correctly
- Check Supabase Edge Function logs for errors

### Download button not showing
- Verify `s3_key` is set in `backup_history` table
- Check that `status = 'success'`
- Refresh the backup history

### Email/WhatsApp not sending
- Verify environment variables are set
- Check Edge Function logs for errors
- For WhatsApp, verify Twilio credentials or use web link fallback

## Environment Variables Reference

### Supabase Edge Functions
- `BACKUP_API_KEY`: API key for update-backup authentication
- `SENDGRID_API_KEY`: SendGrid API key for email (optional)
- `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY`, `AWS_SES_SECRET_KEY`: AWS SES credentials (optional)
- `EMAIL_SERVICE_URL`: Custom email service URL (optional)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`: Twilio credentials for WhatsApp (optional)
- `TWILIO_WHATSAPP_FROM`: Twilio WhatsApp sender number (default: +14155238886)
- `FROM_EMAIL`: Email sender address (default: noreply@console-mana.com)

### GitHub Actions
- `SUPABASE_URL`: Supabase project URL
- `BACKUP_API_KEY`: Same as Edge Function secret
- `S3_BUCKET`: AWS S3 bucket name
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: AWS credentials

## How to Configure Email and WhatsApp Sharing

### Email Sharing Setup

You have three options for email sharing:

#### Option 1: SendGrid (Recommended - Easiest)

1. **Sign up for SendGrid:**
   - Go to https://sendgrid.com
   - Create a free account (100 emails/day free)
   - Verify your email address

2. **Create an API Key:**
   - Go to Settings → API Keys
   - Click "Create API Key"
   - Name it "Backup Sharing" or similar
   - Select "Full Access" or "Mail Send" permissions
   - Copy the API key (you won't see it again!)

3. **Set Environment Variable:**
   - Go to Supabase Dashboard → Edge Functions → Secrets
   - Add secret: `SENDGRID_API_KEY` = `your-api-key-here`
   - Add secret: `FROM_EMAIL` = `your-verified-email@domain.com` (must be verified in SendGrid)

4. **Verify Sender Email:**
   - In SendGrid, go to Settings → Sender Authentication
   - Verify the email address you'll use as the sender
   - Or set up domain authentication for better deliverability

#### Option 2: AWS SES

1. **Set up AWS SES:**
   - Go to AWS Console → Simple Email Service
   - Verify your email address or domain
   - Request production access if needed (sandbox mode is limited)

2. **Create IAM User:**
   - Go to IAM → Users → Create User
   - Attach policy: `AmazonSESFullAccess` (or create custom policy)
   - Create access keys for the user

3. **Set Environment Variables:**
   - In Supabase Edge Functions → Secrets:
     - `AWS_SES_REGION` = `us-east-1` (or your region)
     - `AWS_SES_ACCESS_KEY` = `your-access-key`
     - `AWS_SES_SECRET_KEY` = `your-secret-key`
     - `FROM_EMAIL` = `your-verified-email@domain.com`

**Note:** AWS SES implementation in the code currently requires additional AWS SDK setup. SendGrid is recommended for easier setup.

#### Option 3: Custom Email Service

1. **Set up your email service:**
   - Create an endpoint that accepts POST requests with:
     - `to`: recipient email
     - `subject`: email subject
     - `html`: email HTML content

2. **Set Environment Variable:**
   - In Supabase Edge Functions → Secrets:
     - `EMAIL_SERVICE_URL` = `https://your-email-service.com/send`

3. **Your service should:**
   - Accept JSON POST requests
   - Return 200 OK on success
   - Handle errors appropriately

### WhatsApp Sharing Setup

You have two options:

#### Option 1: Twilio WhatsApp API (Recommended - Direct Messages)

1. **Sign up for Twilio:**
   - Go to https://www.twilio.com
   - Create a free account ($15.50 free credit)
   - Verify your phone number

2. **Set up WhatsApp Sandbox:**
   - Go to Messaging → Try it out → Send a WhatsApp message
   - Follow instructions to join the sandbox
   - Send the join code to the Twilio WhatsApp number

3. **Get Your Credentials:**
   - Go to Console Dashboard
   - Copy your Account SID
   - Go to Auth Tokens → Copy your Auth Token

4. **Set Environment Variables:**
   - In Supabase Edge Functions → Secrets:
     - `TWILIO_ACCOUNT_SID` = `your-account-sid`
     - `TWILIO_AUTH_TOKEN` = `your-auth-token`
     - `TWILIO_WHATSAPP_FROM` = `whatsapp:+14155238886` (default Twilio sandbox number)

5. **For Production:**
   - Request WhatsApp Business API access from Twilio
   - Get your own WhatsApp Business number
   - Update `TWILIO_WHATSAPP_FROM` with your number

#### Option 2: WhatsApp Web Link (No Setup Required)

- **No configuration needed!**
- The system automatically falls back to generating a WhatsApp web link
- Users click the link to open WhatsApp with a pre-filled message
- Works on mobile and desktop

### Testing Your Configuration

1. **Test Email:**
   ```bash
   # In Supabase Edge Functions logs, you should see:
   # "Email sent successfully" or error messages
   ```
   - Trigger a backup share via email
   - Check recipient's inbox (and spam folder)
   - Verify the download link works

2. **Test WhatsApp:**
   ```bash
   # For Twilio: Check Twilio Console → Logs → Messaging
   # For Web Link: Click the generated link
   ```
   - Trigger a backup share via WhatsApp
   - If using Twilio, check Twilio logs
   - If using web link, verify it opens WhatsApp correctly

### Troubleshooting Email/WhatsApp

**Email not sending:**
- Check Supabase Edge Function logs for errors
- Verify API keys are correct (no extra spaces)
- For SendGrid: Check SendGrid Activity Feed for delivery status
- Verify sender email is verified in your email service
- Check spam/junk folders

**WhatsApp not sending:**
- For Twilio: Check Twilio Console → Logs for errors
- Verify phone number format: `+1234567890` (with country code)
- For sandbox: Ensure recipient has joined the sandbox
- Check Twilio account balance
- Web link fallback should always work

**Common Errors:**
- `401 Unauthorized`: API key/token is incorrect
- `403 Forbidden`: Sender email not verified
- `429 Too Many Requests`: Rate limit exceeded (upgrade plan)
- `Invalid phone number`: Format should be `+1234567890`

### Cost Considerations

**SendGrid:**
- Free tier: 100 emails/day
- Essentials: $19.95/month for 50,000 emails
- Good for most use cases

**Twilio WhatsApp:**
- Sandbox: Free (limited to sandbox participants)
- Production: ~$0.005 per message
- Requires WhatsApp Business API approval

**WhatsApp Web Link:**
- Completely free
- No API limits
- Works for all users

## Notes

- The `update-backup` function accepts either `backup_id` or `dispatch_id` to find the backup
- The `s3_key` format should be: `backups/{backup_id}.zip`
- Signed URLs expire after 15 minutes
- Email and WhatsApp sharing require external service configuration (see above)
- For production, always verify sender emails/domains for better deliverability
- Consider rate limiting for high-volume usage

