# Backup Share Setup Guide

This guide explains how to configure Email and WhatsApp sharing for backups.

## Overview

The backup sharing feature allows you to send backup download links via:
- **Email**: Using SendGrid, AWS SES, or a custom email service
- **WhatsApp**: Using Twilio API or WhatsApp Web links

## Prerequisites

1. A deployed `share-backup` Edge Function in Supabase
2. Access to Supabase Dashboard to set secrets
3. An account with one of the email/WhatsApp services below

---

## Email Configuration

### Option 1: SendGrid (Recommended)

SendGrid is a popular email service provider with a free tier (100 emails/day).

#### Step 1: Create a SendGrid Account
1. Go to [https://sendgrid.com](https://sendgrid.com)
2. Sign up for a free account
3. Verify your email address

#### Step 2: Create an API Key
1. In SendGrid Dashboard, go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Name it (e.g., "Backup Sharing")
4. Select **Full Access** or **Restricted Access** with Mail Send permissions
5. Click **Create & View**
6. **Copy the API key** (you won't see it again!)

#### Step 3: Verify Sender Identity
1. Go to **Settings** → **Sender Authentication**
2. Choose **Single Sender Verification** or **Domain Authentication**
3. Follow the verification process
4. Note your verified sender email (e.g., `noreply@yourdomain.com`)

#### Step 4: Set Supabase Secrets
In Supabase Dashboard:
1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add the following secrets:

```
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=noreply@yourdomain.com
```

**Note**: Replace `FROM_EMAIL` with your verified SendGrid sender email.

#### Step 5: Deploy/Update the Function
```bash
supabase functions deploy share-backup --no-verify-jwt
```

---

### Option 2: AWS SES (Simple Email Service)

AWS SES is a cost-effective email service ($0.10 per 1,000 emails after free tier).

#### Step 1: Set Up AWS SES
1. Go to [AWS Console](https://console.aws.amazon.com/ses/)
2. Verify your email address or domain
3. Move out of SES Sandbox (if needed) by requesting production access

#### Step 2: Create IAM User for SES
1. Go to **IAM** → **Users** → **Create User**
2. Name it (e.g., "ses-backup-sender")
3. Attach policy: `AmazonSESFullAccess` or create a custom policy
4. Create Access Key (Access Key ID and Secret Access Key)
5. **Save both keys securely**

#### Step 3: Set Supabase Secrets
In Supabase Dashboard:
1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add the following secrets:

```
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY=AKIAXXXXXXXXXXXXXXXX
AWS_SES_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=verified-email@yourdomain.com
```

**Note**: 
- Replace `AWS_SES_REGION` with your AWS region (e.g., `us-east-1`, `eu-west-1`)
- Replace `FROM_EMAIL` with your verified SES email address

#### Step 4: Update Edge Function
**Note**: The current `share-backup` function has a placeholder for AWS SES. You'll need to implement AWS SDK for SES or use a REST API approach.

---

### Option 3: Custom Email Service

If you have your own email service API:

#### Set Supabase Secrets
```
EMAIL_SERVICE_URL=https://your-email-service.com/api/send
```

The function will send a POST request to this URL with:
```json
{
  "to": "recipient@example.com",
  "subject": "Your Backup is Ready",
  "html": "<h2>Your Backup is Ready</h2><p>...</p>"
}
```

---

## WhatsApp Configuration

### Option 1: Twilio WhatsApp API (Recommended for Production)

Twilio provides a WhatsApp Business API for sending messages programmatically.

#### Step 1: Create a Twilio Account
1. Go to [https://www.twilio.com](https://www.twilio.com)
2. Sign up for an account
3. Verify your phone number

#### Step 2: Set Up WhatsApp Sandbox
1. In Twilio Console, go to **Messaging** → **Try it out** → **Send a WhatsApp message**
2. Follow the instructions to join the WhatsApp Sandbox
3. Send the join code to the Twilio WhatsApp number (usually `+1 415 523 8886`)

#### Step 3: Get Your Twilio Credentials
1. In Twilio Console, go to **Account** → **API Keys & Tokens**
2. Find your **Account SID** and **Auth Token**
3. Note your WhatsApp Sandbox number (format: `whatsapp:+14155238886`)

#### Step 4: Set Supabase Secrets
In Supabase Dashboard:
1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add the following secrets:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

**Note**: 
- Replace `TWILIO_WHATSAPP_FROM` with your Twilio WhatsApp number
- For production, you'll need to upgrade to a Twilio WhatsApp Business account

#### Step 5: Deploy/Update the Function
```bash
supabase functions deploy share-backup --no-verify-jwt
```

---

### Option 2: WhatsApp Web Link (No Configuration Required)

If Twilio is not configured, the function will automatically generate a WhatsApp Web link that opens in the user's browser. This requires no setup but requires the user to manually send the message.

**No configuration needed** - this works automatically as a fallback.

---

## Testing the Configuration

### Test Email Sharing

1. Go to **Backup Settings** in your application
2. Find a completed backup in the history
3. Click the **Email icon** button
4. Enter a test email address
5. Click **Send Email**
6. Check the recipient's inbox (and spam folder)

### Test WhatsApp Sharing

1. Go to **Backup Settings** in your application
2. Find a completed backup in the history
3. Click the **WhatsApp icon** button
4. Enter a phone number with country code (e.g., `+1234567890`)
5. Click **Share via WhatsApp**
6. If Twilio is configured, the message will be sent automatically
7. If not, a WhatsApp Web link will open in a new tab

---

## Troubleshooting

### Email Not Sending

1. **Check Supabase Secrets**: Ensure all required secrets are set correctly
2. **Check Function Logs**: Go to Supabase Dashboard → Edge Functions → `share-backup` → Logs
3. **Verify Sender Email**: Ensure `FROM_EMAIL` matches your verified sender
4. **Check Spam Folder**: Emails might be filtered as spam
5. **SendGrid**: Check SendGrid Activity Feed for delivery status
6. **AWS SES**: Ensure you're out of Sandbox mode for production use

### WhatsApp Not Working

1. **Twilio Not Configured**: If you see a WhatsApp Web link, Twilio is not set up
2. **Check Phone Number Format**: Must include country code (e.g., `+1234567890`)
3. **Twilio Sandbox**: Ensure the recipient has joined your Twilio WhatsApp Sandbox
4. **Check Function Logs**: Look for Twilio API errors in Supabase Dashboard

### Common Errors

**Error: "Email service not configured"**
- Solution: Set at least one email service secret (SENDGRID_API_KEY, AWS_SES credentials, or EMAIL_SERVICE_URL)

**Error: "WhatsApp sending failed"**
- Solution: Check Twilio credentials or use WhatsApp Web link fallback

**Error: "Authentication required"**
- Solution: Ensure you're logged in and the function has proper authentication

---

## Security Best Practices

1. **Never commit secrets to version control**
2. **Use environment-specific secrets** (development, staging, production)
3. **Rotate API keys regularly**
4. **Use least-privilege IAM policies** for AWS SES
5. **Monitor function logs** for suspicious activity
6. **Rate limit sharing** to prevent abuse

---

## Cost Considerations

### Email Services
- **SendGrid Free Tier**: 100 emails/day
- **SendGrid Paid**: Starting at $19.95/month for 50,000 emails
- **AWS SES**: $0.10 per 1,000 emails (after free tier of 62,000 emails/month)

### WhatsApp Services
- **Twilio WhatsApp Sandbox**: Free for testing
- **Twilio WhatsApp Business**: Pay-per-message pricing (varies by country)
- **WhatsApp Web Link**: Free (no API costs)

---

## Additional Resources

- [SendGrid Documentation](https://docs.sendgrid.com/)
- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [Twilio WhatsApp API Documentation](https://www.twilio.com/docs/whatsapp)
- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)

---

## Support

If you encounter issues:
1. Check the function logs in Supabase Dashboard
2. Verify all secrets are set correctly
3. Test with a simple email/phone number first
4. Review the error messages in the application

For additional help, refer to the service provider's documentation or support channels.

