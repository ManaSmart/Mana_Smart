# Quick Deployment Reference Card

Print this page or keep it open while deploying!

---

## 🚀 Quick Steps Summary

### 1. Buy Domain & Hosting (15-30 minutes)
- [ ] Go to hostinger.com → Sign up/Login
- [ ] Search & buy domain → Add to cart → Checkout
- [ ] Buy hosting plan → Link domain → Checkout
- [ ] Wait for activation email

### 2. Prepare Project (10 minutes)
- [ ] Create `.env` file with Supabase credentials
- [ ] Run `npm install`
- [ ] Run `npm run build`
- [ ] Verify `dist` folder created

### 3. Upload Files (10-20 minutes)
- [ ] Login to hpanel.hostinger.com
- [ ] Open File Manager → Go to `public_html`
- [ ] Upload contents of `dist` folder
- [ ] Upload `.htaccess` file to `public_html` root

### 4. Configure (5-10 minutes)
- [ ] Install SSL certificate in hPanel
- [ ] Enable HTTPS redirect
- [ ] Wait 5-15 minutes for SSL activation

### 5. Test (5 minutes)
- [ ] Visit `https://yourdomain.com`
- [ ] Test all features
- [ ] Check browser console for errors

---

## 📝 Important Credentials to Save

**Hostinger:**
- Email: _______________________
- Password: _______________________
- Domain: _______________________
- Hosting IP: _______________________

**Supabase:**
- Project URL: _______________________
- Anon Key: _______________________

**FTP (if using):**
- Host: _______________________
- Username: _______________________
- Password: _______________________

---

## 🔧 Quick Commands

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Preview build locally
npm run preview
```

---

## 📁 Files to Upload

From `dist` folder → Upload to `public_html`:
- ✅ `index.html`
- ✅ `assets/` folder (entire folder)
- ✅ `.htaccess` (copy from project root)
- ✅ Any other files in `dist`

**DO NOT upload:**
- ❌ `node_modules/`
- ❌ `src/`
- ❌ `package.json`
- ❌ `.env` (already embedded in build)

---

## 🆘 Quick Troubleshooting

| Problem | Quick Fix |
|---------|-----------|
| Website shows "Index of /" | Check `index.html` is in `public_html` root |
| 404 on refresh | Verify `.htaccess` is uploaded |
| Assets not loading | Check `assets/` folder uploaded completely |
| Supabase errors | Rebuild with correct `.env` and re-upload |
| SSL not working | Wait 15-30 min, clear cache, reinstall if needed |

---

## 📞 Support Links

- **Hostinger Support:** https://hpanel.hostinger.com (Live Chat)
- **Hostinger Knowledge Base:** https://support.hostinger.com
- **DNS Checker:** https://www.whatsmydns.net
- **PageSpeed Test:** https://pagespeed.web.dev

---

## ✅ Pre-Upload Checklist

Before uploading, verify:
- [ ] `.env` file exists with correct values
- [ ] `npm run build` completed without errors
- [ ] `dist` folder contains `index.html` and `assets/`
- [ ] `.htaccess` file exists in project root
- [ ] Domain and hosting are active in Hostinger

---

## 🎯 Post-Upload Checklist

After uploading, verify:
- [ ] All files in `public_html` (not subfolder)
- [ ] `.htaccess` in `public_html` root
- [ ] File permissions: 644 (files), 755 (folders)
- [ ] SSL certificate installed
- [ ] Website loads at `https://yourdomain.com`
- [ ] No console errors (F12 → Console tab)

---

**Need detailed instructions?** See `HOSTINGER_STEP_BY_STEP_GUIDE.md`

