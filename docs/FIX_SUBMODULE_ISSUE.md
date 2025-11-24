# Fix Git Submodule Issue

## Problem
GitHub Actions is showing this warning:
```
fatal: No url found for submodule path 'Mana_Smart' in .gitmodules
```

## Solution

### Option 1: Remove the Submodule Reference (Recommended)

If the `Mana_Smart` folder is not needed as a submodule:

```bash
# Remove from Git cache (keeps the folder locally)
git rm --cached Mana_Smart

# If you want to delete the folder entirely
rm -rf Mana_Smart

# Commit the change
git add .gitignore  # If you added it to .gitignore
git commit -m "Remove Mana_Smart submodule reference"
git push
```

### Option 2: Add to .gitignore (If folder should be ignored)

If the folder exists but shouldn't be tracked:

1. Add to `.gitignore`:
   ```
   Mana_Smart/
   ```

2. Remove from Git cache:
   ```bash
   git rm --cached -r Mana_Smart
   git commit -m "Ignore Mana_Smart folder"
   git push
   ```

### Option 3: Configure as Actual Submodule (If needed)

If `Mana_Smart` should be a submodule:

1. Create/edit `.gitmodules`:
   ```ini
   [submodule "Mana_Smart"]
       path = Mana_Smart
       url = https://github.com/your-org/Mana_Smart.git
   ```

2. Initialize the submodule:
   ```bash
   git submodule update --init --recursive
   git add .gitmodules
   git commit -m "Add Mana_Smart as submodule"
   git push
   ```

## Quick Fix (Already Applied in Workflow)

The workflow file has been updated to disable submodule checkout:
```yaml
- name: Checkout code
  uses: actions/checkout@v4
  with:
    submodules: false  # This prevents the warning
```

This means the warning won't cause the workflow to fail, but you should still fix the repository state.

## Recommended Action

**Option 1** is recommended if you don't need the `Mana_Smart` folder as a submodule.

