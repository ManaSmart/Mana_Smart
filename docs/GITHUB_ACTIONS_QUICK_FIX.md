# GitHub Actions Backup - Quick Fix Reference

## 🚨 Immediate Fixes Required

### 1. Environment Variables Not Available to Node.js

**Problem:** `supabaseUrl is required` error

**Solution:** Add `env:` block at **job level** (not step level):

```yaml
jobs:
  backup:
    runs-on: ubuntu-latest
    env:  # ← ADD THIS
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
      # ... all other secrets
```

### 2. Node.js Script Can't Access Variables

**Problem:** Variables defined in `env:` but Node.js can't see them

**Solution:** Use `process.env.VARIABLE_NAME` in Node.js:

```javascript
// ✅ CORRECT
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ❌ WRONG
const url = SUPABASE_URL;  // Not available
```

### 3. Passing Dynamic Variables to Node.js

**Problem:** Variables calculated in bash need to reach Node.js

**Solution:** Pass via command line:

```yaml
# ✅ CORRECT
run: |
  STATUS="success" \
  ERROR_TEXT="" \
  node -e "console.log(process.env.STATUS);"

# ❌ WRONG
run: |
  export STATUS="success"  # Won't work with env: block
  node -e "console.log(process.env.STATUS);"
```

### 4. Git Submodule Warning

**Problem:** `fatal: No url found for submodule path 'Mana_Smart'`

**Solution:** Disable submodule checkout:

```yaml
- name: Checkout code
  uses: actions/checkout@v4
  with:
    submodules: false  # ← ADD THIS
```

## 📝 Minimal Working Example

```yaml
name: Backup Test

on:
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: false
      
      - name: Test Supabase
        run: |
          node -e "
          const { createClient } = require('@supabase/supabase-js');
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
          
          if (!url || !key) {
            console.error('Missing credentials');
            process.exit(1);
          }
          
          const supabase = createClient(url, key);
          console.log('✓ Connected to Supabase');
          "
```

## ✅ Checklist

- [ ] All secrets defined in GitHub Secrets
- [ ] `env:` block at job level (not step level)
- [ ] Node.js uses `process.env.VARIABLE_NAME`
- [ ] Submodule checkout disabled
- [ ] Service role key (not anon key) used
- [ ] Direct DB URL (port 5432, not 6543) used

## 🔗 Full Documentation

See `docs/GITHUB_ACTIONS_BACKUP_FIX.md` for complete workflow file.

