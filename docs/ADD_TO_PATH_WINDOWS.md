# How to Add Supabase CLI to Windows PATH

This guide shows you how to add the Supabase CLI folder to your Windows PATH environment variable so you can use `supabase` command from anywhere.

## Method 1: Using Windows Settings (Easiest - Windows 10/11)

### Step 1: Find Your Supabase CLI Location

1. Extract the `supabase_windows_amd64.zip` file you downloaded
2. Note the full path where you extracted it
   - Example: `C:\Users\Abdul\Downloads\supabase` or `C:\Tools\supabase`
   - **Important**: Use the folder that contains the `supabase.exe` file

### Step 2: Open Environment Variables

1. Press `Windows Key + R` to open Run dialog
2. Type: `sysdm.cpl` and press Enter
3. Click the **Advanced** tab
4. Click **Environment Variables** button at the bottom

**Alternative method:**
1. Press `Windows Key + X` (or right-click Start button)
2. Select **System**
3. Click **Advanced system settings** (on the right)
4. Click **Environment Variables** button

### Step 3: Edit PATH Variable

1. In the **User variables** section (top half), find `Path`
2. Click on `Path` to select it
3. Click **Edit** button
4. Click **New** button
5. Paste or type the full path to your Supabase CLI folder
   - Example: `C:\Users\Abdul\Downloads\supabase`
6. Click **OK** on all open windows

### Step 4: Verify Installation

1. **Close and reopen** your PowerShell/Terminal window (important!)
2. Run:
   ```powershell
   supabase --version
   ```
3. You should see the version number (e.g., `v1.x.x`)

---

## Method 2: Using PowerShell (Quick Method)

### Step 1: Find Your Supabase CLI Path

Note the full path where you extracted Supabase CLI:
- Example: `C:\Users\Abdul\Downloads\supabase`

### Step 2: Add to PATH Using PowerShell

Open PowerShell **as Administrator** (right-click PowerShell → Run as Administrator) and run:

```powershell
# Replace with your actual path
$supabasePath = "C:\Users\Abdul\Downloads\supabase"

# Add to user PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$currentPath;$supabasePath", "User")
```

### Step 3: Verify

Close and reopen PowerShell, then run:
```powershell
supabase --version
```

---

## Method 3: Using Command Prompt

### Step 1: Open Command Prompt as Administrator

1. Press `Windows Key + X`
2. Select **Command Prompt (Admin)** or **Windows PowerShell (Admin)**

### Step 2: Add to PATH

```cmd
setx PATH "%PATH%;C:\Users\Abdul\Downloads\supabase" /M
```

**Note**: Replace `C:\Users\Abdul\Downloads\supabase` with your actual path.

### Step 3: Verify

Close and reopen Command Prompt, then run:
```cmd
supabase --version
```

---

## Troubleshooting

### "supabase is not recognized"

**Solution 1**: Make sure you closed and reopened your terminal/PowerShell window after adding to PATH.

**Solution 2**: Verify the path is correct:
```powershell
# Check if the path exists
Test-Path "C:\Users\Abdul\Downloads\supabase\supabase.exe"
```

**Solution 3**: Verify PATH was added correctly:
```powershell
# View your PATH
$env:Path -split ';' | Select-String "supabase"
```

**Solution 4**: Make sure you added the folder containing `supabase.exe`, not the parent folder.

### Path with Spaces

If your path contains spaces, make sure to include the full path in quotes when adding to PATH:
- Example: `"C:\Program Files\Supabase CLI"`

### Still Not Working?

1. **Restart your computer** (sometimes required for PATH changes to take effect)
2. **Check the exact path**: Make sure `supabase.exe` exists in the folder you added
3. **Try full path**: Test by running the full path directly:
   ```powershell
   C:\Users\Abdul\Downloads\supabase\supabase.exe --version
   ```

---

## Recommended: Create a Dedicated Tools Folder

For better organization, create a dedicated folder for CLI tools:

1. Create folder: `C:\Tools`
2. Extract Supabase CLI to: `C:\Tools\supabase`
3. Add `C:\Tools\supabase` to your PATH
4. Future CLI tools can go in `C:\Tools\` as well

This keeps your PATH clean and organized.

---

## Quick Verification Checklist

- [ ] Extracted Supabase CLI to a folder
- [ ] Found the full path to the folder containing `supabase.exe`
- [ ] Added the path to Windows PATH environment variable
- [ ] Closed and reopened PowerShell/Terminal
- [ ] Ran `supabase --version` successfully
- [ ] See version number displayed

---

**Last Updated**: 2024-11-22

