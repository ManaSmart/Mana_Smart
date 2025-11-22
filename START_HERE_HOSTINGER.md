# 🚀 START HERE: Hosting Your App on Hostinger

Welcome! This guide will help you host your Mana Smart Scent application on Hostinger.

---

## 📚 Which Guide Should I Use?

### **For Complete Beginners:**
👉 **Start with:** `HOSTINGER_STEP_BY_STEP_GUIDE.md`
- Detailed, step-by-step instructions
- Every click explained
- Perfect if this is your first time hosting

### **For Quick Reference:**
👉 **Use:** `QUICK_DEPLOYMENT_REFERENCE.md`
- Quick checklist
- Command reference
- Troubleshooting tips
- Print-friendly format

### **For Detailed Technical Info:**
👉 **See:** `HOSTINGER_DEPLOYMENT_GUIDE.md`
- Comprehensive technical guide
- Advanced configurations
- All deployment options

---

## ⚡ Quick Start (5-Minute Overview)

### What You'll Need:
1. ✅ Hostinger account (create at hostinger.com)
2. ✅ Domain name (buy from Hostinger)
3. ✅ Hosting plan (buy from Hostinger)
4. ✅ Your Supabase credentials
5. ✅ This project built and ready

### The Process:
1. **Buy Domain & Hosting** (15-30 min)
   - Register on Hostinger
   - Purchase domain
   - Purchase hosting plan

2. **Prepare Your Project** (10 min)
   - Create `.env` file with Supabase credentials
   - Run `npm install`
   - Run `npm run build`

3. **Upload to Hostinger** (10-20 min)
   - Login to hPanel
   - Upload `dist` folder contents to `public_html`
   - Upload `.htaccess` file

4. **Configure & Test** (10 min)
   - Install SSL certificate
   - Test your website
   - Fix any issues

**Total Time:** ~45-70 minutes

---

## 📋 Pre-Deployment Checklist

Before you start, make sure you have:

- [ ] **Supabase Credentials Ready**
  - Project URL (from Supabase dashboard)
  - Anon Key (from Supabase dashboard)

- [ ] **Node.js Installed**
  - Check: Run `node --version` in terminal
  - Download: https://nodejs.org if not installed

- [ ] **Project Ready**
  - All code committed/saved
  - No critical bugs
  - Tested locally

- [ ] **Budget Ready**
  - Domain: ~$10-15/year
  - Hosting: ~$3-5/month (or $30-60/year)

---

## 🎯 Step-by-Step Path

### Step 1: Read the Detailed Guide
Open `HOSTINGER_STEP_BY_STEP_GUIDE.md` and follow it from the beginning.

### Step 2: Prepare Your Project
```bash
# 1. Create .env file in project root
# Add your Supabase credentials:
VITE_SUPABASE_URL=your_url_here
VITE_SUPABASE_ANON_KEY=your_key_here

# 2. Install dependencies
npm install

# 3. Build project
npm run build

# 4. Verify dist folder was created
# Check that dist/index.html and dist/assets/ exist
```

### Step 3: Buy Domain & Hosting
Follow Part 1 of `HOSTINGER_STEP_BY_STEP_GUIDE.md`

### Step 4: Upload Files
Follow Part 3 of `HOSTINGER_STEP_BY_STEP_GUIDE.md`

### Step 5: Configure & Test
Follow Parts 4-5 of `HOSTINGER_STEP_BY_STEP_GUIDE.md`

---

## 🔧 Important Notes

### About .htaccess File
- ✅ The `.htaccess` file is **automatically copied** to `dist` folder when you run `npm run build`
- ✅ You still need to upload it to `public_html` on Hostinger
- ✅ It handles React Router routing and performance optimization

### About Environment Variables
- ✅ Create `.env` file in project root (not in `src` folder)
- ✅ Variables must start with `VITE_` prefix
- ✅ Build process embeds these into your app
- ✅ You don't need to upload `.env` to Hostinger

### About File Uploads
- ✅ Upload **contents** of `dist` folder (not the `dist` folder itself)
- ✅ Upload to `public_html` folder (not a subfolder)
- ✅ Include `.htaccess` file in `public_html` root

---

## 🆘 Need Help?

### Common Questions:

**Q: How long does it take?**
A: 45-70 minutes total (mostly waiting for activation)

**Q: Do I need technical knowledge?**
A: No! The step-by-step guide explains everything.

**Q: What if something goes wrong?**
A: Check the troubleshooting section in the guides, or contact Hostinger support (24/7 live chat)

**Q: Can I use a different hosting provider?**
A: Yes, but you'll need to adapt the instructions. This guide is specifically for Hostinger.

**Q: Do I need to know coding?**
A: No, just follow the instructions step by step.

---

## 📞 Support Resources

### Hostinger Support:
- **Live Chat:** Available 24/7 in hPanel
- **Email:** support@hostinger.com
- **Knowledge Base:** https://support.hostinger.com

### Project Issues:
- Check browser console (F12) for errors
- Verify Supabase project is active
- Rebuild and re-upload if needed

---

## ✅ Success Checklist

You'll know you're done when:

- [ ] Website loads at `https://yourdomain.com`
- [ ] No 404 errors
- [ ] All pages/routes work
- [ ] Supabase connection works
- [ ] No console errors
- [ ] SSL certificate active (green padlock in browser)

---

## 🎉 Ready to Start?

1. **Open:** `HOSTINGER_STEP_BY_STEP_GUIDE.md`
2. **Follow:** Each step carefully
3. **Reference:** `QUICK_DEPLOYMENT_REFERENCE.md` as needed
4. **Celebrate:** When your site is live! 🚀

---

**Good luck with your deployment!** 🎊

If you get stuck, the guides have detailed troubleshooting sections, and Hostinger support is always available to help.

