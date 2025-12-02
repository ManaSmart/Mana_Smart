# Backup System cURL Examples

Quick reference for testing the backup system via command line.

## Prerequisites

Set these variables in your shell:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export BACKUP_API_KEY="your_backup_api_key_here"
```

## 1. Get Backup Settings

```bash
curl -X GET "${SUPABASE_URL}/functions/v1/settings-toggle" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "backup_enabled": true,
  "last_backup_at": "2024-01-15T02:00:00.000Z"
}
```

## 2. Enable/Disable Automatic Backups

```bash
# Enable backups
curl -X POST "${SUPABASE_URL}/functions/v1/settings-toggle" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"backup_enabled": true}'

# Disable backups
curl -X POST "${SUPABASE_URL}/functions/v1/settings-toggle" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"backup_enabled": false}'
```

**Response:**
```json
{
  "success": true,
  "message": "Settings updated"
}
```

## 3. Trigger Manual Backup

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/trigger-backup" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "dispatch_id": "550e8400-e29b-41d4-a716-446655440000",
  "status_url": "/functions/v1/backup-status?dispatch_id=550e8400-e29b-41d4-a716-446655440000",
  "message": "Backup workflow triggered successfully"
}
```

**Save the dispatch_id for polling:**
```bash
export DISPATCH_ID="550e8400-e29b-41d4-a716-446655440000"
```

## 4. Poll Backup Status

```bash
curl -X GET "${SUPABASE_URL}/functions/v1/backup-status?dispatch_id=${DISPATCH_ID}" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json"
```

**Response (in progress):**
```json
{
  "status": "in_progress",
  "message": "Backup in progress"
}
```

**Response (success):**
```json
{
  "status": "success",
  "signed_url": "https://s3.amazonaws.com/bucket/backups/2024-01-15/backup-2024-01-15-02-00-UTC.zip?X-Amz-Algorithm=...",
  "backup_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Response (failed):**
```json
{
  "status": "failed",
  "error": "Backup workflow failed. Check GitHub Actions logs for details.",
  "backup_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

## 5. Get Backup History

```bash
# Get last 5 backups
curl -X GET "${SUPABASE_URL}/functions/v1/backup-history?limit=5" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json"
```

**Response:**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "s3_key": "backups/2024-01-15/backup-2024-01-15-02-00-UTC.zip",
    "created_at": "2024-01-15T02:00:00.000Z",
    "status": "success",
    "size_bytes": 52428800,
    "error_text": null
  },
  {
    "id": "223e4567-e89b-12d3-a456-426614174001",
    "s3_key": null,
    "created_at": "2024-01-14T02:00:00.000Z",
    "status": "failed",
    "size_bytes": null,
    "error_text": "S3 upload failed after 3 attempts"
  }
]
```

## 6. Generate Signed URL for Existing Backup

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/generate-signed-url" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"s3_key": "backups/2024-01-15/backup-2024-01-15-02-00-UTC.zip"}'
```

**Response:**
```json
{
  "signed_url": "https://s3.amazonaws.com/bucket/backups/2024-01-15/backup-2024-01-15-02-00-UTC.zip?X-Amz-Algorithm=...",
  "expires_in": 900
}
```

## Complete Backup Flow Example

```bash
#!/bin/bash

# Configuration
SUPABASE_URL="https://your-project.supabase.co"
BACKUP_API_KEY="your_backup_api_key_here"

# 1. Trigger backup
echo "Triggering backup..."
RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/trigger-backup" \
  -H "Authorization: Bearer ${BACKUP_API_KEY}" \
  -H "Content-Type: application/json")

DISPATCH_ID=$(echo $RESPONSE | jq -r '.dispatch_id')
echo "Backup triggered. Dispatch ID: ${DISPATCH_ID}"

# 2. Poll for completion
echo "Waiting for backup to complete..."
MAX_ATTEMPTS=120
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  STATUS_RESPONSE=$(curl -s -X GET "${SUPABASE_URL}/functions/v1/backup-status?dispatch_id=${DISPATCH_ID}" \
    -H "Authorization: Bearer ${BACKUP_API_KEY}" \
    -H "Content-Type: application/json")
  
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')
  
  if [ "$STATUS" = "success" ]; then
    SIGNED_URL=$(echo $STATUS_RESPONSE | jq -r '.signed_url')
    echo "Backup completed successfully!"
    echo "Download URL: ${SIGNED_URL}"
    break
  elif [ "$STATUS" = "failed" ]; then
    ERROR=$(echo $STATUS_RESPONSE | jq -r '.error')
    echo "Backup failed: ${ERROR}"
    exit 1
  fi
  
  ATTEMPT=$((ATTEMPT + 1))
  echo "Status: ${STATUS} (attempt ${ATTEMPT}/${MAX_ATTEMPTS})"
  sleep 3
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo "Backup timed out after ${MAX_ATTEMPTS} attempts"
  exit 1
fi
```

## Error Responses

All endpoints may return these error responses:

**401 Unauthorized:**
```json
{
  "error": "Missing or invalid authorization header"
}
```

**403 Forbidden:**
```json
{
  "error": "Invalid API key"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error",
  "message": "Detailed error message"
}
```

## Notes

- All signed URLs expire after 15 minutes
- Backup operations typically take 5-30 minutes depending on data size
- Poll every 3-5 seconds for status updates
- Maximum recommended polling duration: 10 minutes (200 attempts at 3s intervals)

