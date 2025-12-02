# GitHub Actions Backup Workflow - Complete Fix Guide

## 🔍 Root Cause Analysis

### Error 1: "Check backup enable status" - Supabase URL Missing

**Root Cause:**
- The Node.js script is trying to create a Supabase client but `SUPABASE_URL` is not available in the process environment
- Environment variables from GitHub Secrets are not being passed to the Node.js process
- The `env:` block may be missing or incorrectly configured

**Location:** First step that checks if backup is enabled

### Error 2: "Updating backup_history" - Supabase URL Missing

**Root Cause:**
- Same issue as Error 1, but occurring in the final step
- The script tries to update `backup_history` table but can't connect to Supabase
- Environment variables are not accessible to the Node.js process

**Location:** Final step that updates backup status

### Error 3: Git Submodule Warning

**Root Cause:**
- Repository has a folder named `Mana_Smart` that Git thinks should be a submodule
- But `.gitmodules` file doesn't contain an entry for it
- This happens when:
  - A folder was previously a submodule but was removed incorrectly
  - Or a folder exists that matches a submodule pattern

**Solution Options:**
1. Remove the folder if it's not needed
2. Add it to `.gitmodules` if it should be a submodule
3. Remove from Git cache if it's a false positive

## ✅ Complete Fix

### Step 1: Fix Environment Variables in Workflow

The key issue is that environment variables must be:
1. **Defined in the `env:` block** at the job or step level
2. **Passed correctly to Node.js** processes
3. **Available to all steps** that need them

### Step 2: Create/Update `.github/workflows/backup.yml`

Here's the corrected workflow file with all fixes applied:

```yaml
name: Backup Database and Storage

on:
  workflow_dispatch:  # Allow manual triggers
  schedule:
    - cron: '0 2 * * *'  # Daily at 2:00 AM UTC

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    
    # ✅ FIX: Define all environment variables at job level
    # This makes them available to ALL steps
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      AWS_S3_REGION: ${{ secrets.AWS_S3_REGION }}
      AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
      SUPABASE_BUCKETS_TO_BACKUP: ${{ secrets.SUPABASE_BUCKETS_TO_BACKUP }}
      DISPATCH_ID: ${{ github.event.inputs.dispatch_id || github.run_id }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        # ✅ FIX: Disable submodule checkout to avoid the warning
        with:
          submodules: false
          # Or if you need submodules, use: submodules: recursive

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Check backup enable status
        # ✅ FIX: Environment variables are inherited from job-level env:
        # No need to redefine them here unless you want to override
        run: |
          node -e "
          const { createClient } = require('@supabase/supabase-js');
          
          // ✅ FIX: Get from process.env (automatically available from job env:)
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          
          if (!supabaseUrl || !supabaseKey) {
            console.error('Missing Supabase credentials');
            console.error('SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
            console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'SET' : 'MISSING');
            process.exit(1);
          }
          
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          supabase
            .from('system_settings_kv')
            .select('value')
            .eq('key', 'backup_enabled')
            .single()
            .then(({ data, error }) => {
              if (error && error.code !== 'PGRST116') {
                console.error('Error checking backup status:', error);
                process.exit(1);
              }
              
              const enabled = data?.value?.enabled ?? false;
              if (!enabled) {
                console.log('Backup is disabled. Exiting.');
                process.exit(0);
              }
              
              console.log('Backup is enabled. Proceeding...');
            })
            .catch((err) => {
              console.error('Failed to check backup status:', err);
              process.exit(1);
            });
          "

      - name: Update backup status (in progress)
        run: |
          node -e "
          const { createClient } = require('@supabase/supabase-js');
          
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const dispatchId = process.env.DISPATCH_ID;
          
          if (!supabaseUrl || !supabaseKey) {
            console.error('Missing Supabase credentials');
            process.exit(1);
          }
          
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          supabase
            .from('backup_history')
            .update({ status: 'in_progress' })
            .eq('dispatch_id', dispatchId)
            .then(({ error }) => {
              if (error) {
                console.error('Error updating backup status:', error);
                process.exit(1);
              }
              console.log('Backup status updated to in_progress');
            })
            .catch((err) => {
              console.error('Failed to update backup status:', err);
              process.exit(1);
            });
          "

      - name: Export database
        run: |
          mkdir -p backup/db
          pg_dump --dbname="$SUPABASE_DB_URL" \
            --no-owner \
            --no-privileges \
            --format=plain \
            --blobs \
            --verbose \
            --file=backup/db/backup.sql

      - name: Export auth users
        run: |
          mkdir -p backup/auth
          node -e "
          const { createClient } = require('@supabase/supabase-js');
          const fs = require('fs');
          
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          supabase.auth.admin.listUsers()
            .then(({ data, error }) => {
              if (error) throw error;
              fs.writeFileSync(
                'backup/auth/users.json',
                JSON.stringify(data.users, null, 2)
              );
              console.log('Exported', data.users.length, 'auth users');
            })
            .catch((err) => {
              console.error('Failed to export auth users:', err);
              process.exit(1);
            });
          "

      - name: Download Supabase Storage files
        run: |
          mkdir -p backup/storage
          node -e "
          const { createClient } = require('@supabase/supabase-js');
          const fs = require('fs');
          const path = require('path');
          
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const buckets = (process.env.SUPABASE_BUCKETS_TO_BACKUP || '').split(',').map(b => b.trim()).filter(Boolean);
          
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          async function downloadBucket(bucketName) {
            const { data: files, error } = await supabase.storage.from(bucketName).list('', { limit: 1000, recursive: true });
            if (error) {
              console.error('Error listing files in', bucketName, ':', error);
              return;
            }
            
            const bucketDir = path.join('backup/storage', bucketName);
            fs.mkdirSync(bucketDir, { recursive: true });
            
            for (const file of files || []) {
              if (file.id) {
                const { data, error: downloadError } = await supabase.storage
                  .from(bucketName)
                  .download(file.name);
                
                if (downloadError) {
                  console.error('Error downloading', file.name, ':', downloadError);
                  continue;
                }
                
                const filePath = path.join(bucketDir, file.name);
                const dir = path.dirname(filePath);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(filePath, Buffer.from(await data.arrayBuffer()));
                console.log('Downloaded:', file.name);
              }
            }
          }
          
          Promise.all(buckets.map(downloadBucket))
            .then(() => console.log('All storage files downloaded'))
            .catch((err) => {
              console.error('Failed to download storage files:', err);
              process.exit(1);
            });
          "

      - name: Create backup archive
        run: |
          TIMESTAMP=$(date -u +"%Y-%m-%d-%H-%M-UTC")
          BACKUP_NAME="backup-$TIMESTAMP.zip"
          zip -r "$BACKUP_NAME" backup/
          echo "BACKUP_FILE=$BACKUP_NAME" >> $GITHUB_ENV
          echo "BACKUP_SIZE=$(stat -f%z "$BACKUP_NAME" 2>/dev/null || stat -c%s "$BACKUP_NAME")" >> $GITHUB_ENV

      - name: Upload to S3
        run: |
          aws s3 cp "$BACKUP_FILE" "s3://$AWS_S3_BUCKET/backups/$(date -u +"%Y/%m/%d")/$BACKUP_FILE" \
            --region "$AWS_S3_REGION"
          echo "S3_KEY=backups/$(date -u +"%Y/%m/%d")/$BACKUP_FILE" >> $GITHUB_ENV

      - name: Update backup_history and system_settings
        # ✅ FIX: Pass variables via command line, not export
        # Variables from env: are already available, but we pass STATUS/ERROR_TEXT explicitly
        run: |
          FINAL_STATUS="success"
          FINAL_ERROR_TEXT=""
          S3_KEY="${{ env.S3_KEY }}"
          BACKUP_SIZE="${{ env.BACKUP_SIZE }}"
          
          # ✅ FIX: Pass variables directly to Node.js process
          STATUS="$FINAL_STATUS" \
          ERROR_TEXT="$FINAL_ERROR_TEXT" \
          S3_KEY="$S3_KEY" \
          BACKUP_SIZE="$BACKUP_SIZE" \
          node -e "
          const { createClient } = require('@supabase/supabase-js');
          
          // ✅ FIX: Get all variables from process.env
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const dispatchId = process.env.DISPATCH_ID;
          const status = process.env.STATUS;
          const errorText = process.env.ERROR_TEXT || null;
          const s3Key = process.env.S3_KEY;
          const sizeBytes = process.env.BACKUP_SIZE ? parseInt(process.env.BACKUP_SIZE, 10) : null;
          
          // ✅ FIX: Validate all required variables
          if (!supabaseUrl || !supabaseKey) {
            console.error('✗ CRITICAL ERROR: Missing Supabase credentials');
            console.error('SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
            console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'SET' : 'MISSING');
            process.exit(1);
          }
          
          if (!dispatchId) {
            console.error('✗ CRITICAL ERROR: Missing DISPATCH_ID');
            process.exit(1);
          }
          
          console.log('✓ Supabase credentials validated');
          console.log('✓ Updating backup_history with:');
          console.log('  - dispatch_id:', dispatchId);
          console.log('  - status:', status);
          console.log('  - s3_key:', s3Key);
          console.log('  - size_bytes:', sizeBytes);
          
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          // Update backup_history
          supabase
            .from('backup_history')
            .update({
              status: status,
              s3_key: s3Key,
              size_bytes: sizeBytes,
              error_text: errorText,
            })
            .eq('dispatch_id', dispatchId)
            .then(({ data, error }) => {
              if (error) {
                console.error('✗ CRITICAL ERROR updating backup history');
                console.error('Error:', error);
                console.error('Error code:', error.code);
                console.error('Error message:', error.message);
                console.error('Error details:', error.details);
                console.error('Error hint:', error.hint);
                process.exit(1);
              }
              
              console.log('✓ Backup history updated successfully');
              
              // Update system_settings_kv
              return supabase
                .from('system_settings_kv')
                .upsert({
                  key: 'last_backup_at',
                  value: new Date().toISOString(),
                }, {
                  onConflict: 'key',
                });
            })
            .then(({ error: settingsError }) => {
              if (settingsError) {
                console.error('⚠ Warning: Failed to update last_backup_at:', settingsError);
                // Don't fail the step, just log the warning
              } else {
                console.log('✓ System settings updated');
              }
            })
            .catch((err) => {
              console.error('✗ CRITICAL ERROR:', err);
              process.exit(1);
            });
          "

      - name: Handle backup failure
        if: failure()
        run: |
          FINAL_STATUS="failed"
          FINAL_ERROR_TEXT="Backup workflow failed. Check GitHub Actions logs for details."
          
          STATUS="$FINAL_STATUS" \
          ERROR_TEXT="$FINAL_ERROR_TEXT" \
          node -e "
          const { createClient } = require('@supabase/supabase-js');
          
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const dispatchId = process.env.DISPATCH_ID;
          const status = process.env.STATUS;
          const errorText = process.env.ERROR_TEXT;
          
          if (!supabaseUrl || !supabaseKey || !dispatchId) {
            console.error('Cannot update backup status - missing credentials');
            process.exit(1);
          }
          
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          supabase
            .from('backup_history')
            .update({
              status: status,
              error_text: errorText,
            })
            .eq('dispatch_id', dispatchId)
            .then(({ error }) => {
              if (error) {
                console.error('Failed to update backup status to failed:', error);
              } else {
                console.log('Backup status updated to failed');
              }
            });
          "
```

### Step 3: Fix Git Submodule Issue

Choose one of these solutions:

#### Option A: Remove the Submodule Reference (Recommended if not needed)

```bash
# Remove from Git cache
git rm --cached Mana_Smart

# If it's a directory, remove it
rm -rf Mana_Smart

# Commit the change
git commit -m "Remove Mana_Smart submodule reference"
```

#### Option B: Add to .gitmodules (If it should be a submodule)

Create or edit `.gitmodules`:

```ini
[submodule "Mana_Smart"]
    path = Mana_Smart
    url = https://github.com/your-org/Mana_Smart.git
```

Then:

```bash
git submodule update --init --recursive
```

#### Option C: Update Workflow to Skip Submodules

In the workflow file, update the checkout step:

```yaml
- name: Checkout code
  uses: actions/checkout@v4
  with:
    submodules: false  # Skip submodules entirely
```

### Step 4: Verify GitHub Secrets

Ensure all these secrets are set in GitHub:

1. Go to: **Repository → Settings → Secrets and variables → Actions**
2. Verify these secrets exist:

| Secret Name | Required | Description |
|------------|----------|-------------|
| `SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Service role key from Supabase |
| `SUPABASE_DB_URL` | ✅ Yes | Direct PostgreSQL connection string (port 5432) |
| `AWS_ACCESS_KEY_ID` | ✅ Yes | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | ✅ Yes | AWS secret key |
| `AWS_S3_REGION` | ✅ Yes | S3 bucket region |
| `AWS_S3_BUCKET` | ✅ Yes | S3 bucket name |
| `SUPABASE_BUCKETS_TO_BACKUP` | ✅ Yes | Comma-separated bucket names |

### Step 5: Verify RLS Policies

The `backup_history` table should allow service role key to write:

```sql
-- Check current RLS policies
SELECT * FROM pg_policies WHERE tablename = 'backup_history';

-- If service role can't write, temporarily disable RLS or add policy
-- Option 1: Disable RLS (NOT recommended for production)
ALTER TABLE backup_history DISABLE ROW LEVEL SECURITY;

-- Option 2: Add policy allowing service role (RECOMMENDED)
-- Service role key bypasses RLS by default, but verify:
-- The service role key should work without RLS policies
-- If it doesn't, check that you're using the correct key
```

**Important:** The service role key should bypass RLS automatically. If it doesn't, verify:
1. You're using the **service_role** key, not the **anon** key
2. The key is correct (copy from Supabase Dashboard → Settings → API)

### Step 6: Test the Workflow

1. **Commit the fixed workflow file:**
   ```bash
   git add .github/workflows/backup.yml
   git commit -m "Fix backup workflow environment variables and submodule issue"
   git push
   ```

2. **Manually trigger the workflow:**
   - Go to: **Actions → Backup Database and Storage → Run workflow**

3. **Monitor the logs:**
   - Check each step for errors
   - Verify environment variables are available
   - Confirm backup_history is updated

## 🔍 Debugging Tips

### Check if Environment Variables are Available

Add this debug step after any step that uses Node.js:

```yaml
- name: Debug environment variables
  run: |
    echo "SUPABASE_URL: ${SUPABASE_URL:0:20}..." # Show first 20 chars
    echo "SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:0:20}..."
    echo "DISPATCH_ID: $DISPATCH_ID"
```

### Test Supabase Connection

Add a test step:

```yaml
- name: Test Supabase connection
  run: |
    node -e "
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('URL exists:', !!url);
    console.log('Key exists:', !!key);
    if (url && key) {
      const supabase = createClient(url, key);
      supabase.from('backup_history').select('count').then(({ error }) => {
        if (error) {
          console.error('Connection test failed:', error);
          process.exit(1);
        }
        console.log('✓ Connection test passed');
      });
    }
    "
```

## 📋 Summary of Fixes

1. ✅ **Environment Variables**: Defined at job level, available to all steps
2. ✅ **Node.js Scripts**: Use `process.env` to access variables
3. ✅ **Variable Passing**: Pass dynamic variables via command line (`VAR="value" node ...`)
4. ✅ **Submodule Issue**: Disabled submodule checkout in workflow
5. ✅ **Error Handling**: Added validation and better error messages
6. ✅ **RLS Policies**: Service role key should bypass RLS (verify key is correct)

## 🚨 Common Mistakes to Avoid

1. ❌ **Don't use `export` in bash when `env:` block exists** - Variables won't be available to Node.js
2. ❌ **Don't forget to define variables at job level** - Step-level `env:` doesn't inherit from job
3. ❌ **Don't use pooled connection URL** - Must use direct connection (port 5432) for `pg_dump`
4. ❌ **Don't use anon key** - Must use service_role key for admin operations
5. ❌ **Don't commit secrets** - Always use GitHub Secrets, never hardcode

---

**Status**: ✅ **COMPLETE FIX PROVIDED**

**Next Steps:**
1. Copy the corrected workflow YAML to `.github/workflows/backup.yml`
2. Fix the submodule issue (Option A recommended)
3. Verify all GitHub Secrets are set
4. Test the workflow manually
5. Monitor the first run for any remaining issues

