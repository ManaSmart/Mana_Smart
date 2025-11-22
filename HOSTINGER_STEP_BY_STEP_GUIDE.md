# Complete Step-by-Step Guide: Hosting Your App on Hostinger

This is a **detailed, beginner-friendly guide** that walks you through every single step from buying a domain to having your website live.

---

## 📋 Table of Contents

1. [Part 1: Buying Domain & Hosting](#part-1-buying-domain--hosting)
2. [Part 2: Preparing Your Project](#part-2-preparing-your-project)
3. [Part 3: Uploading to Hostinger](#part-3-uploading-to-hostinger)
4. [Part 4: Configuring Domain & SSL](#part-4-configuring-domain--ssl)
5. [Part 5: Testing & Troubleshooting](#part-5-testing--troubleshooting)

---

## Part 1: Buying Domain & Hosting

### Step 1.1: Create Hostinger Account

1. **Go to Hostinger Website**
   - Open your browser
   - Visit: **https://www.hostinger.com**
   - Click the **"Sign In"** button (top right corner)

2. **Register New Account**
   - If you don't have an account, click **"Create Account"** or **"Register"**
   - Enter your email address
   - Create a strong password
   - Click **"Create Account"**
   - Verify your email (check your inbox for verification link)

3. **Login**
   - After verification, login with your email and password

---

### Step 1.2: Purchase a Domain

1. **Navigate to Domain Search**
   - After logging in, you'll see the Hostinger dashboard
   - Click on **"Domains"** in the top navigation menu
   - Or click **"Search for a domain"** button

2. **Search for Your Domain**
   - In the search box, type your desired domain name
   - Example: `manasmartscent.com` or `yourbusiness.com`
   - Click **"Search"** button

3. **Select Your Domain**
   - You'll see available domain extensions (.com, .net, .org, etc.)
   - **Recommended:** Choose `.com` (most professional and trusted)
   - Click **"Add to Cart"** next to your chosen domain
   - A popup may appear asking about hosting - you can skip this for now or select "I'll add hosting later"

4. **Review Your Cart**
   - Click the shopping cart icon (usually top right)
   - Review your domain selection
   - Choose registration period:
     - **1 year** (cheapest upfront)
     - **2-10 years** (better long-term pricing, auto-renewal recommended)
   - **Important:** Enable **"Auto-renewal"** to avoid losing your domain

5. **Complete Purchase**
   - Click **"Checkout"** or **"Proceed to Payment"**
   - Enter your billing information:
     - Full name
     - Address
     - City, State, ZIP
     - Country
     - Phone number
   - Select payment method:
     - Credit/Debit card
     - PayPal
     - Other available methods
   - Enter payment details
   - Review order summary
   - Click **"Complete Purchase"** or **"Pay Now"**

6. **Confirmation**
   - You'll receive a confirmation email
   - Your domain is now registered! (usually takes 5-15 minutes to activate)

---

### Step 1.3: Purchase Hosting Plan

1. **Navigate to Hosting**
   - In Hostinger dashboard, click **"Web Hosting"** in the navigation
   - Or go to: **https://www.hostinger.com/web-hosting**

2. **Choose a Hosting Plan**

   **Option A: Web Hosting (Budget-friendly)**
   - Good for: Small to medium websites
   - Price: Usually $2-4/month
   - Includes: 100 GB storage, free SSL, email accounts
   - **Recommended if:** You're just starting out

   **Option B: Business Web Hosting (Recommended)**
   - Good for: Business websites, better performance
   - Price: Usually $3-5/month
   - Includes: 200 GB storage, better speed, more resources
   - **Recommended if:** You want better performance

   **Click "Select"** on your chosen plan

3. **Link Your Domain**
   - During checkout, you'll see: **"Which domain will you use?"**
   - Select: **"I'll use my existing domain"**
   - Enter the domain you just purchased
   - Or select it from the dropdown if it's in your account

4. **Choose Billing Period**
   - **12 months** (most common, good discount)
   - **24 months** (better discount)
   - **48 months** (best discount, but longer commitment)
   - **Recommendation:** Start with 12 months

5. **Add-ons (Optional)**
   - **Domain Privacy Protection:** Hides your personal info (optional but recommended)
   - **Backup:** Automatic backups (recommended)
   - **Email:** Professional email accounts (optional)
   - You can skip these and add later if needed

6. **Complete Hosting Purchase**
   - Review your order
   - Enter payment information (if not saved)
   - Click **"Complete Purchase"**

7. **Wait for Activation**
   - You'll receive an email with hosting account details
   - Activation usually takes **5-30 minutes** (can take up to 24 hours)
   - You'll get:
     - Hosting account username
     - Temporary password
     - Server IP address
     - FTP credentials

---

## Part 2: Preparing Your Project

### Step 2.1: Get Your Supabase Credentials

1. **Login to Supabase**
   - Go to: **https://app.supabase.com**
   - Login with your Supabase account

2. **Get Your Project URL**
   - Select your project
   - Go to **Settings** → **API**
   - Find **"Project URL"**
   - Copy it (looks like: `https://xxxxxxxxxxxxx.supabase.co`)

3. **Get Your Anon Key**
   - In the same API settings page
   - Find **"anon public"** key
   - Copy it (long string of characters)

4. **Save These Credentials**
   - Keep them safe, you'll need them in the next step

---

### Step 2.2: Create Environment File

1. **Open Your Project Folder**
   - Navigate to your project: `C:\Users\H\Desktop\New folder\MANA\Mana_Smart_Scent`

2. **Create `.env` File**
   - In the root folder (same level as `package.json`)
   - Create a new file named: `.env`
   - **Important:** The file must be named exactly `.env` (with the dot at the beginning)

3. **Add Your Credentials**
   - Open `.env` file in a text editor
   - Add these lines (replace with your actual values):

   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

   **Example:**
   ```env
   VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMiwiZXhwIjoxOTMxODE1MDIyfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

4. **Save the File**
   - Save `.env` file
   - **Important:** Never commit this file to Git (it should be in `.gitignore`)

---

### Step 2.3: Install Dependencies

1. **Open Terminal/Command Prompt**
   - In your project folder, open PowerShell or Command Prompt
   - Or use VS Code terminal

2. **Install Dependencies**
   - Run this command:
   ```bash
   npm install
   ```
   - Wait for installation to complete (may take 2-5 minutes)
   - You should see: "added XXX packages"

---

### Step 2.4: Build Your Project

1. **Build for Production**
   - In the same terminal, run:
   ```bash
   npm run build
   ```

2. **Wait for Build to Complete**
   - This will:
     - Compile TypeScript
     - Bundle your React app
     - Optimize assets
     - Embed environment variables
   - You should see: "build completed" or similar message

3. **Verify Build Output**
   - Check that a `dist` folder was created
   - Open the `dist` folder
   - You should see:
     - `index.html`
     - `assets/` folder (with CSS and JS files)
     - `vite.svg` (if present)

4. **Test Build Locally (Optional)**
   - Run: `npm run preview`
   - Open browser to the URL shown (usually `http://localhost:4173`)
   - Verify your app works correctly
   - Press `Ctrl+C` to stop the preview server

---

## Part 3: Uploading to Hostinger

### Step 3.1: Access Hostinger hPanel

1. **Login to hPanel**
   - Go to: **https://hpanel.hostinger.com**
   - Enter your email and password
   - Click **"Sign In"**

2. **Navigate to Your Hosting**
   - After login, you'll see the dashboard
   - Find **"Hosting"** section
   - Click **"Manage"** next to your hosting account

---

### Step 3.2: Open File Manager

1. **Find File Manager**
   - In the hosting management page
   - Look for **"Files"** section
   - Click **"File Manager"**
   - Or look for **"File Manager"** in the left sidebar

2. **Navigate to Public HTML**
   - In File Manager, you'll see folders
   - Double-click on **`public_html`** folder
   - **This is where your website files go!**

3. **Clear Default Files (if any)**
   - If you see files like:
     - `index.html`
     - `cgi-bin` folder
     - `public_html` folder
   - Select them and delete (you can keep `cgi-bin` if you see it)
   - **Important:** Make sure `public_html` folder is empty (or only has `default.php` which you'll delete in the next step)

---

### Step 3.3: Upload Your Files

**Method 1: Using File Manager (Easiest)**

1. **Prepare Files for Upload**
   - On your computer, open the `dist` folder
   - You need to upload:
     - `index.html`
     - `assets/` folder (entire folder)
     - Any other files/folders in `dist`

2. **Delete Default Files (if present)**
   - In File Manager, make sure you're in `public_html` folder
   - If you see `default.php` or `index.html` (Hostinger's default file):
     - **Right-click** on `default.php` → Select **"Delete"** or **"Remove"**
     - Confirm deletion
     - This is just a placeholder file and can be safely deleted
   - Your `public_html` folder should now be empty (or only contain files you want to keep)

3. **Upload via File Manager**
   - While still in `public_html` folder, click **"Upload"** button (usually top toolbar)
   - A new window/tab will open

4. **Select Files**
   - Click **"Select Files"** or drag and drop
   - Navigate to your `dist` folder
   - Select:
     - `index.html`
     - `assets` folder (select the entire folder)
     - Any other files
   - Click **"Open"** or **"Upload"**

5. **Wait for Upload**
   - Files will upload (progress bar will show)
   - Wait until all files are uploaded (may take 1-5 minutes depending on size)

6. **Verify Upload**
   - In File Manager, refresh the page
   - You should see:
     - `index.html`
     - `assets/` folder
     - Other uploaded files
   - The `default.php` file should be gone (replaced by your `index.html`)

**Method 2: Using FTP (Faster for Large Files)**

1. **Get FTP Credentials**
   - In hPanel, go to **"FTP Accounts"**
   - You'll see your FTP details:
     - **Host:** `ftp.yourdomain.com` or an IP address
     - **Username:** Your FTP username
     - **Password:** Your FTP password
   - Note these down

2. **Download FTP Client**
   - Download **FileZilla** (free): https://filezilla-project.org
   - Or use **WinSCP** (Windows): https://winscp.net
   - Install the software

3. **Connect via FTP**
   - Open FileZilla (or your FTP client)
   - Enter:
     - **Host:** Your FTP host
     - **Username:** Your FTP username
     - **Password:** Your FTP password
     - **Port:** 21 (or 22 for SFTP)
   - Click **"Quickconnect"**

4. **Upload Files**
   - On the right side (remote server), navigate to `public_html`
   - On the left side (local computer), navigate to your `dist` folder
   - Select all files and folders in `dist`
   - Drag and drop to `public_html` on the right
   - Wait for upload to complete

---

### Step 3.4: Upload .htaccess File

1. **Copy .htaccess File**
   - In your project root folder, you should have a `.htaccess` file
   - If not, it's already in your project (we checked earlier)

2. **Upload .htaccess**
   - Using File Manager or FTP
   - Upload `.htaccess` to `public_html` folder
   - **Important:** The file must be in the root of `public_html` (same level as `index.html`)

3. **Verify File Permissions**
   - In File Manager, right-click on files
   - Select **"Change Permissions"** or **"File Permissions"**
   - Set:
     - **Files:** `644` (read/write for owner, read for others)
     - **Folders:** `755` (read/write/execute for owner, read/execute for others)
   - Click **"Save"**

---

## Part 4: Configuring Domain & SSL

### Step 4.1: Link Domain to Hosting

1. **Check Domain Status**
   - In hPanel, go to **"Domains"**
   - Find your domain
   - It should show as **"Active"** or **"Connected"**

2. **If Domain Needs Linking**
   - Click on your domain
   - Look for **"DNS Zone Editor"** or **"Manage DNS"**
   - Ensure A record points to your hosting IP
   - If not set, add:
     - **Type:** A
     - **Name:** @ (or leave blank)
     - **Points to:** Your hosting IP (found in hosting details)
     - **TTL:** 3600

---

### Step 4.2: Install SSL Certificate (HTTPS)

1. **Navigate to SSL Settings**
   - In hPanel, go to **"SSL"** or **"Security"**
   - Or look for **"Let's Encrypt"** or **"Free SSL"**

2. **Install SSL**
   - Click **"Install SSL"** or **"Get Free SSL"**
   - Select your domain
   - Click **"Install"** or **"Generate"**

3. **Wait for Activation**
   - SSL installation takes 5-15 minutes
   - You'll see status: "Installing..." then "Active"

4. **Enable HTTPS Redirect (Optional but Recommended)**
   - In SSL settings, look for **"Force HTTPS"** or **"HTTPS Redirect"**
   - Enable it
   - This automatically redirects HTTP to HTTPS

---

### Step 4.3: Verify DNS Propagation

1. **Check DNS Status**
   - Visit: **https://www.whatsmydns.net**
   - Enter your domain name
   - Check if A record points to your hosting IP
   - **Note:** DNS changes can take 1-48 hours, but usually work within 1-2 hours

2. **Test Domain Access**
   - Open browser
   - Visit: `http://yourdomain.com`
   - If it doesn't work yet, wait a bit and try again
   - You can also use the temporary URL provided by Hostinger

---

## Part 5: Testing & Troubleshooting

### Step 5.1: Test Your Website

1. **Access Your Website**
   - Open browser
   - Visit: `https://yourdomain.com` (or `http://` if SSL not ready)
   - Your website should load!

2. **Test Basic Functionality**
   - ✅ Homepage loads
   - ✅ No 404 errors
   - ✅ Images and assets load
   - ✅ Navigation works
   - ✅ Login works (if applicable)
   - ✅ Supabase connection works

3. **Check Browser Console**
   - Press `F12` to open Developer Tools
   - Go to **"Console"** tab
   - Look for any red errors
   - If you see errors, note them down

4. **Test on Mobile**
   - Open your website on a phone
   - Or use browser's mobile view (F12 → Toggle device toolbar)
   - Verify responsive design works

---

### Step 5.2: Common Issues & Solutions

**Issue 1: Website Shows "Index of /" or Directory Listing**

**Solution:**
- Make sure `index.html` is in `public_html` root
- Check file permissions (should be 644)
- Verify `.htaccess` file is uploaded

**Issue 2: 404 Errors on Page Refresh**

**Solution:**
- Ensure `.htaccess` file is uploaded correctly
- Check that mod_rewrite is enabled (usually is by default on Hostinger)
- Verify `.htaccess` content is correct

**Issue 3: Assets Not Loading (CSS/JS 404)**

**Solution:**
- Verify `assets/` folder is uploaded completely
- Check file paths in browser console
- Ensure all files in `assets/` folder are uploaded
- Clear browser cache (Ctrl+Shift+Delete)

**Issue 4: Supabase Connection Errors**

**Solution:**
- Verify environment variables in `.env` are correct
- Rebuild project: `npm run build`
- Re-upload `dist` folder
- Check Supabase project is active
- Check browser console for specific error

**Issue 5: Website Not Loading at All**

**Solution:**
- Check DNS propagation (use whatsmydns.net)
- Verify files are in `public_html` (not a subfolder)
- Check file permissions
- Try temporary URL from Hostinger
- Contact Hostinger support if still not working

**Issue 6: SSL Certificate Not Working**

**Solution:**
- Wait 15-30 minutes after installation
- Clear browser cache
- Try accessing `https://yourdomain.com` directly
- Check SSL status in hPanel
- Reinstall SSL if needed

---

### Step 5.3: Performance Optimization

1. **Enable Caching**
   - Your `.htaccess` already has caching rules
   - Verify it's uploaded correctly

2. **Optimize Images**
   - Compress images before uploading
   - Use WebP format when possible

3. **Monitor Performance**
   - Use Google PageSpeed Insights: https://pagespeed.web.dev
   - Enter your domain
   - Follow recommendations

---

## ✅ Final Checklist

Before considering deployment complete:

- [ ] Domain purchased and active
- [ ] Hosting plan purchased and active
- [ ] `.env` file created with correct Supabase credentials
- [ ] Project built successfully (`npm run build`)
- [ ] All files uploaded to `public_html`
- [ ] `.htaccess` file uploaded
- [ ] Domain linked to hosting
- [ ] SSL certificate installed
- [ ] Website accessible at `https://yourdomain.com`
- [ ] All functionality tested and working
- [ ] No console errors
- [ ] Mobile responsive design verified

---

## 📞 Getting Help

**Hostinger Support:**
- **Live Chat:** Available in hPanel (24/7)
- **Email:** support@hostinger.com
- **Knowledge Base:** https://support.hostinger.com
- **Phone:** Check hPanel for phone support (if available in your region)

**Project-Specific Issues:**
- Check browser console for errors
- Verify Supabase project is active
- Rebuild and re-upload if needed

---

## 🎉 Congratulations!

Your website should now be live! 

**Next Steps:**
1. Set up regular backups in hPanel
2. Monitor website performance
3. Set up email accounts (if needed)
4. Configure Google Analytics (optional)
5. Keep your dependencies updated

---

**Last Updated:** 2024
**Project:** Mana Smart Scent - React + Vite Application

