# Setup ManaSmart Git Authentication

## Problem
Git is using old `ab1div` credentials instead of ManaSmart organization credentials.

## Solution Options

### Option 1: Use Personal Access Token (Recommended)

1. **Create a GitHub Personal Access Token:**
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Name it: "ManaSmart Git Access"
   - Select scopes:
     - ✅ `repo` (full control of private repositories)
     - ✅ `workflow` (update GitHub Action workflows)
   - Click "Generate token"
   - **Copy the token immediately** (starts with `ghp_`)

2. **Update Git Remote to Use Token:**
   ```powershell
   # Replace YOUR_TOKEN with your actual token
   git remote set-url origin https://YOUR_TOKEN@github.com/ManaSmart/Mana_Smart.git
   ```

   **Or use your ManaSmart username:**
   ```powershell
   # Replace YOUR_TOKEN with your actual token
   git remote set-url origin https://ManaSmart:YOUR_TOKEN@github.com/ManaSmart/Mana_Smart.git
   ```

3. **Test the connection:**
   ```powershell
   git push origin main
   ```

### Option 2: Use SSH (More Secure)

1. **Check if you have SSH keys:**
   ```powershell
   Test-Path ~/.ssh/id_rsa.pub
   ```

2. **Generate SSH key (if you don't have one):**
   ```powershell
   ssh-keygen -t ed25519 -C "manasmartscent@gmail.com"
   # Press Enter to accept default location
   # Optionally set a passphrase
   ```

3. **Add SSH key to GitHub:**
   ```powershell
   # Copy your public key
   Get-Content ~/.ssh/id_ed25519.pub | Set-Clipboard
   ```
   - Go to: https://github.com/settings/keys
   - Click "New SSH key"
   - Paste the key
   - Click "Add SSH key"

4. **Update remote to use SSH:**
   ```powershell
   git remote set-url origin git@github.com:ManaSmart/Mana_Smart.git
   ```

5. **Test the connection:**
   ```powershell
   ssh -T git@github.com
   git push origin main
   ```

### Option 3: Use GitHub CLI (gh)

1. **Install GitHub CLI** (if not installed):
   ```powershell
   winget install --id GitHub.cli
   ```

2. **Login with GitHub CLI:**
   ```powershell
   gh auth login
   # Follow prompts:
   # - GitHub.com
   # - HTTPS
   # - Login with a web browser
   # - Copy the code and paste in browser
   ```

3. **Git will automatically use gh credentials:**
   ```powershell
   git push origin main
   ```

## Verify Current Setup

```powershell
# Check remote URL
git remote -v

# Check Git config
git config --global user.name
git config --global user.email

# List stored credentials
cmdkey /list | Select-String -Pattern "github"
```

## Troubleshooting

### Still Getting Permission Denied

1. **Make sure you're a member of ManaSmart organization:**
   - Go to: https://github.com/orgs/ManaSmart/people
   - Verify your account is listed

2. **Check repository permissions:**
   - Go to: https://github.com/ManaSmart/Mana_Smart/settings/access
   - Make sure your account has write access

3. **Clear all GitHub credentials:**
   ```powershell
   # List all credentials
   cmdkey /list
   
   # Delete GitHub-related credentials
   cmdkey /delete:LegacyGeneric:target=git:https://github.com
   cmdkey /delete:LegacyGeneric:target=git:https://github.com/ManaSmart
   ```

4. **Try pushing again:**
   ```powershell
   git push origin main
   ```

### Token Authentication Issues

If using a token and it's not working:
- Make sure token has `repo` scope
- Token might be expired (create a new one)
- Make sure token has access to ManaSmart organization

### SSH Connection Issues

If SSH isn't working:
```powershell
# Test SSH connection
ssh -T git@github.com

# If it says "Permission denied", check:
# 1. SSH key is added to GitHub account
# 2. SSH key is added to ManaSmart organization (if required)
# 3. SSH agent is running: ssh-add ~/.ssh/id_ed25519
```

