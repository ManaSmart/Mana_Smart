# Complete Guide: Hosting Your Project on Hostinger

This guide will walk you through the complete process of hosting your React + Vite application on Hostinger, including purchasing a domain and linking it to your hosting.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Purchase a Domain on Hostinger](#step-1-purchase-a-domain-on-hostinger)
3. [Step 2: Purchase Hosting Plan](#step-2-purchase-hosting-plan)
4. [Step 3: Build Your Project](#step-3-build-your-project)
5. [Step 4: Upload Files to Hostinger](#step-4-upload-files-to-hostinger)
6. [Step 5: Configure Environment Variables](#step-5-configure-environment-variables)
7. [Step 6: Link Domain to Hosting](#step-6-link-domain-to-hosting)
8. [Step 7: Configure Domain DNS (if needed)](#step-7-configure-domain-dns-if-needed)
9. [Step 8: Test Your Website](#step-8-test-your-website)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, make sure you have:
- ✅ A Hostinger account (create one at [hostinger.com](https://www.hostinger.com))
- ✅ Your Supabase credentials ready:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- ✅ Node.js installed on your local machine
- ✅ Your project code ready

---

## Step 1: Purchase a Domain on Hostinger

### Option A: Buy a New Domain

1. **Go to Hostinger Website**
   - Visit [www.hostinger.com](https://www.hostinger.com)
   - Click "Sign In" or "Register" to create an account

2. **Search for Your Domain**
   - Click on "Domains" in the navigation menu
   - Enter your desired domain name (e.g., `yourbusiness.com`)
   - Click "Search"

3. **Select Your Domain**
   - Choose from available extensions (.com, .net, .org, etc.)
   - Review pricing and select the domain you want
   - Click "Add to Cart"

4. **Complete Purchase**
   - Review your cart
   - Choose registration period (1-10 years)
   - Add any additional services if needed
   - Complete the payment process

### Option B: Transfer Existing Domain

If you already have a domain elsewhere:
1. Go to Hostinger → Domains → Transfer Domain
2. Enter your domain name
3. Follow the transfer process (you'll need the authorization code from your current registrar)

---

## Step 2: Purchase Hosting Plan

1. **Select Hosting Plan**
   - Go to Hostinger → "Web Hosting"
   - Choose a plan (for a React app, "Web Hosting" or "Business Web Hosting" works well)
   - Recommended: **Business Web Hosting** (better performance)

2. **Link Domain to Hosting**
   - During checkout, you'll be asked to link a domain
   - Select the domain you purchased in Step 1
   - Or choose "I'll use my existing domain" if you have one

3. **Complete Hosting Purchase**
   - Review plan details
   - Complete payment
   - Wait for account activation (usually instant, but can take up to 24 hours)

---

## Step 3: Build Your Project

Before uploading, you need to build your React application for production.

### 3.1 Install Dependencies (if not already done)

```bash
npm install
```

### 3.2 Create Environment File

Create a `.env` file in your project root with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Important:** Replace `your_supabase_project_url` and `your_supabase_anon_key` with your actual Supabase credentials.

### 3.3 Build the Project

Run the build command:

```bash
npm run build
```

This will create a `dist` folder containing all the production-ready files.

### 3.4 Verify Build Output

Check that the `dist` folder contains:
- `index.html`
- `assets/` folder with CSS and JS files
- Any other static files

---

## Step 4: Upload Files to Hostinger

### 4.1 Access File Manager

1. **Login to Hostinger**
   - Go to [hpanel.hostinger.com](https://hpanel.hostinger.com)
   - Login with your credentials

2. **Open File Manager**
   - In the hPanel dashboard, find "Files" section
   - Click on "File Manager"

### 4.2 Navigate to Public HTML Directory

1. **Go to Public Directory**
   - Navigate to `public_html` folder
   - This is where your website files should be uploaded

2. **Clear Existing Files (if any)**
   - Delete any default files (like `index.html`, `cgi-bin`, etc.)
   - Keep the folder structure clean

### 4.3 Upload Your Build Files

**Method 1: Using File Manager (Recommended for beginners)**

1. In File Manager, navigate to `public_html`
2. Click "Upload" button
3. Select all files from your `dist` folder:
   - `index.html`
   - `assets/` folder (entire folder)
   - Any other files/folders
4. Wait for upload to complete

**Method 2: Using FTP (Faster for large files)**

1. **Get FTP Credentials**
   - In hPanel, go to "FTP Accounts"
   - Note your FTP host, username, and password
   - Or create a new FTP account

2. **Connect via FTP Client**
   - Use FileZilla, WinSCP, or any FTP client
   - Connect using:
     - Host: `ftp.yourdomain.com` or IP provided
     - Username: Your FTP username
     - Password: Your FTP password
     - Port: 21 (or 22 for SFTP)

3. **Upload Files**
   - Navigate to `public_html` on the server
   - Upload all contents from your `dist` folder
   - Maintain folder structure

**Method 3: Using Git (Advanced)**

If you have Git access:
1. Initialize Git in your project
2. Push to a repository
3. Use Hostinger's Git deployment feature (if available in your plan)

---

## Step 5: Configure Environment Variables

Since Vite builds environment variables at build time, you have two options:

### Option A: Build with Environment Variables (Recommended)

Build your project locally with the `.env` file, then upload the built files. The environment variables will be embedded in the build.

### Option B: Use Hostinger's Environment Variables (If supported)

Some Hostinger plans support environment variables:
1. In hPanel, look for "Environment Variables" or ".env" settings
2. Add your variables:
   ```
   VITE_SUPABASE_URL=your_url
   VITE_SUPABASE_ANON_KEY=your_key
   ```
3. Rebuild on the server (if you have Node.js access)

**Note:** For static hosting, Option A is the standard approach.

---

## Step 6: Link Domain to Hosting

### If Domain and Hosting are on Same Account

1. **Automatic Linking**
   - If you purchased both together, they're usually linked automatically
   - Check in hPanel → "Domains" → Your domain should show as "Active"

2. **Manual Linking**
   - Go to hPanel → "Domains"
   - Click on your domain
   - Select "Manage" → "DNS Zone Editor"
   - Ensure A record points to your hosting IP

### If Domain is on Different Account/Provider

You'll need to update DNS records (see Step 7).

---

## Step 7: Configure Domain DNS (if needed)

If your domain is registered elsewhere or needs manual DNS configuration:

### 7.1 Get Your Hosting IP Address

1. In hPanel, go to "Hosting" → "Manage"
2. Find your server IP address
3. Note it down (e.g., `185.123.45.67`)

### 7.2 Update DNS Records

**If domain is on Hostinger:**
1. Go to hPanel → "Domains" → Your domain
2. Click "DNS Zone Editor"
3. Update A record:
   - Type: `A`
   - Name: `@` (or leave blank)
   - Points to: Your hosting IP
   - TTL: `3600` (or default)

**If domain is on another provider:**
1. Login to your domain registrar (GoDaddy, Namecheap, etc.)
2. Go to DNS Management
3. Update A record:
   - Host: `@` or blank
   - Points to: Your Hostinger IP
   - TTL: 3600
4. Save changes

### 7.3 Wait for DNS Propagation

- DNS changes can take 24-48 hours to propagate
- Usually works within 1-2 hours
- Check propagation status at [whatsmydns.net](https://www.whatsmydns.net)

---

## Step 8: Test Your Website

### 8.1 Access Your Website

1. **Via Domain**
   - Open browser
   - Visit `http://yourdomain.com`
   - Wait a few minutes if you just uploaded files

2. **Via Temporary URL**
   - Hostinger provides a temporary URL
   - Check in hPanel → "Hosting" → "Manage"
   - Look for "Temporary URL" or "Preview URL"
   - Format: `http://yourdomain.hostingersite.com`

### 8.2 Enable HTTPS (SSL Certificate)

1. **Get Free SSL**
   - In hPanel, go to "SSL" or "Security"
   - Click "Install SSL" or "Let's Encrypt"
   - Select your domain
   - Click "Install"
   - Wait for activation (usually 5-10 minutes)

2. **Force HTTPS (Optional)**
   - In hPanel, look for "Force HTTPS" or ".htaccess" settings
   - Enable redirect from HTTP to HTTPS

### 8.3 Verify Functionality

Test these features:
- ✅ Website loads correctly
- ✅ All pages/routes work
- ✅ Supabase connection works
- ✅ API calls function properly
- ✅ Images and assets load
- ✅ No console errors

---

## Troubleshooting

### Issue: Website shows "Index of /" or directory listing

**Solution:**
- Ensure `index.html` is in the `public_html` root
- Check file permissions (should be 644 for files, 755 for folders)

### Issue: 404 errors on page refresh (React Router)

**Solution:**
Create a `.htaccess` file in `public_html` with:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### Issue: Environment variables not working

**Solution:**
- Rebuild locally with `.env` file
- Upload fresh `dist` folder
- Ensure variables start with `VITE_` prefix

### Issue: Assets not loading (404 on CSS/JS)

**Solution:**
- Check that `assets` folder is uploaded correctly
- Verify file paths in `index.html` are relative (not absolute)
- Clear browser cache

### Issue: Supabase connection errors

**Solution:**
- Verify environment variables are correct
- Check Supabase project is active
- Ensure CORS settings in Supabase allow your domain
- Check browser console for specific error messages

### Issue: Slow website loading

**Solution:**
- Enable caching in hPanel
- Optimize images before upload
- Consider upgrading hosting plan
- Use CDN (if available in your plan)

### Issue: Can't access File Manager

**Solution:**
- Clear browser cache
- Try different browser
- Contact Hostinger support

---

## Additional Configuration

### Setting Up Custom Error Pages

1. Create `404.html` in `public_html`
2. Configure in hPanel → "Error Pages"

### Performance Optimization

1. **Enable Gzip Compression**
   - Add to `.htaccess`:
   ```apache
   <IfModule mod_deflate.c>
     AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript
   </IfModule>
   ```

2. **Browser Caching**
   - Add to `.htaccess`:
   ```apache
   <IfModule mod_expires.c>
     ExpiresActive On
     ExpiresByType image/jpg "access plus 1 year"
     ExpiresByType image/jpeg "access plus 1 year"
     ExpiresByType image/png "access plus 1 year"
     ExpiresByType text/css "access plus 1 month"
     ExpiresByType application/javascript "access plus 1 month"
   </IfModule>
   ```

---

## Quick Reference Checklist

- [ ] Purchased domain on Hostinger
- [ ] Purchased hosting plan
- [ ] Created `.env` file with Supabase credentials
- [ ] Built project (`npm run build`)
- [ ] Uploaded `dist` folder contents to `public_html`
- [ ] Linked domain to hosting
- [ ] Configured DNS (if needed)
- [ ] Installed SSL certificate
- [ ] Tested website functionality
- [ ] Created `.htaccess` for React Router (if needed)

---

## Support Resources

- **Hostinger Support:** [support.hostinger.com](https://support.hostinger.com)
- **Hostinger Knowledge Base:** [support.hostinger.com/en](https://support.hostinger.com/en)
- **Hostinger Live Chat:** Available in hPanel
- **Vite Documentation:** [vitejs.dev](https://vitejs.dev)
- **React Router Documentation:** [reactrouter.com](https://reactrouter.com)

---

## Next Steps After Deployment

1. **Set up monitoring** - Use tools like Google Analytics
2. **Backup regularly** - Configure automatic backups in hPanel
3. **Update regularly** - Keep your dependencies updated
4. **Monitor performance** - Use tools like Google PageSpeed Insights
5. **Set up email** - Configure email accounts in hPanel if needed

---

**Last Updated:** 2024
**Project:** Mana Smart Scent - React + Vite Application

