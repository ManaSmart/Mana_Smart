# Backup System Quick Start

## 5-Minute Setup

### 1. Run Migration (1 min)

```bash
# Execute the SQL migration
# Note: Use your direct PostgreSQL connection URL (port 5432)
psql $SUPABASE_DB_URL -f supabase/migrations/007_create_backup_system.sql
```

Or via Supabase Dashboard → SQL Editor → paste and run the migration.

### 2. Set GitHub Secrets (2 min)

Go to: GitHub Repo → Settings → Secrets and variables → Actions

Add these secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` (⚠️ Must be direct connection, port 5432, NOT pooled)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_REGION`
- `AWS_S3_BUCKET`
- `SUPABASE_BUCKETS_TO_BACKUP` (e.g., `uploads,documents`)
- `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `BACKUP_API_KEY` (generate with: `openssl rand -hex 32`)

### 3. Deploy Edge Functions (1 min)

```bash
supabase functions deploy trigger-backup
supabase functions deploy backup-status
supabase functions deploy generate-signed-url
supabase functions deploy settings-toggle
supabase functions deploy backup-history
```

Set secrets:
```bash
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
# ... (all other secrets)
```

### 4. Configure Frontend (1 min)

Add to `.env`:
```env
VITE_BACKUP_API_KEY=your_backup_api_key_here
```

Import and use component:
```tsx
import { BackupSettings } from "./components/BackupSettings";

// In your Settings page
<BackupSettings />
```

### 5. Test (1 min)

1. Go to Settings → Backup
2. Toggle "Enable Automatic Daily Backups"
3. Click "Download Backup Now"
4. Wait for completion and verify download

## That's It! 🎉

Your backup system is now configured. Backups will run daily at 2:00 AM UTC.

## Next Steps

- Review [BACKUP_SYSTEM_SETUP.md](./BACKUP_SYSTEM_SETUP.md) for detailed documentation
- Check [BACKUP_CURL_EXAMPLES.md](./BACKUP_CURL_EXAMPLES.md) for API testing
- Monitor backups in Settings → Backup → Backup History

