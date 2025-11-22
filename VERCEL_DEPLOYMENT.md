# Vercel Deployment Guide for Mana Smart Scent

This guide will walk you through deploying your React + Vite application to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Your project code in a Git repository (GitHub, GitLab, or Bitbucket)
3. Your Supabase credentials

## Step 1: Prepare Your Project

### 1.1 Ensure Your Code is in Git

Make sure your project is committed to a Git repository:

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 1.2 Create Environment Variables File (Optional, for local reference)

Create a `.env.example` file to document required environment variables:

```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**Note:** Do NOT commit `.env` files with actual credentials to Git. Only commit `.env.example`.

## Step 2: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended for First Time)

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Sign in or create an account
   - Click "Add New..." → "Project"

2. **Import Your Repository**
   - Connect your Git provider (GitHub, GitLab, or Bitbucket)
   - Select your repository: `Mana_Smart_Scent`
   - Click "Import"

3. **Configure Project Settings**
   - **Framework Preset:** Vite (should auto-detect)
   - **Root Directory:** `./` (leave as default)
   - **Build Command:** `npm run build` (should auto-detect)
   - **Output Directory:** `dist` (should auto-detect)
   - **Install Command:** `npm install` (should auto-detect)

4. **Add Environment Variables**
   - Click "Environment Variables"
   - Add the following variables:
     - `VITE_SUPABASE_URL` = Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` = Your Supabase anonymous key
   - Make sure to add them for all environments (Production, Preview, Development)

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete (usually 2-5 minutes)

### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Yes**
   - Which scope? Select your account
   - Link to existing project? **No** (for first deployment)
   - Project name? `mana-smart-scent` (or your preferred name)
   - Directory? `./` (press Enter)
   - Override settings? **No**

4. **Add Environment Variables via CLI**
   ```bash
   vercel env add VITE_SUPABASE_URL
   vercel env add VITE_SUPABASE_ANON_KEY
   ```
   
   For each variable, select:
   - **Production:** Yes
   - **Preview:** Yes
   - **Development:** Yes

5. **Redeploy with Environment Variables**
   ```bash
   vercel --prod
   ```

## Step 3: Verify Deployment

1. **Check Build Logs**
   - Go to your project dashboard on Vercel
   - Click on the latest deployment
   - Review the build logs for any errors

2. **Test Your Application**
   - Visit your deployment URL (e.g., `https://mana-smart-scent.vercel.app`)
   - Test key functionality:
     - Login
     - Data fetching from Supabase
     - File uploads (if applicable)

3. **Check Browser Console**
   - Open browser DevTools (F12)
   - Check for any console errors
   - Verify API calls are working

## Step 4: Configure Custom Domain (Optional)

1. **Add Domain in Vercel**
   - Go to your project settings
   - Click "Domains"
   - Add your custom domain
   - Follow DNS configuration instructions

2. **Update Supabase CORS Settings**
   - Go to your Supabase project settings
   - Add your Vercel domain to allowed origins
   - This ensures API calls work from your custom domain

## Step 5: Set Up Continuous Deployment

Vercel automatically deploys on every push to your main branch. To configure:

1. **Production Branch**
   - Settings → Git → Production Branch
   - Set to `main` or `master`

2. **Preview Deployments**
   - Every pull request automatically gets a preview deployment
   - Preview URLs are shared in PR comments

3. **Branch Protection (Optional)**
   - Only deploy to production after manual approval
   - Settings → Git → Deploy Protection

## Troubleshooting

### Build Fails

1. **Check Build Logs**
   - Look for TypeScript errors
   - Check for missing dependencies
   - Verify environment variables are set

2. **Common Issues**
   - **Missing dependencies:** Run `npm install` locally and commit `package-lock.json`
   - **TypeScript errors:** Fix all TS errors before deploying
   - **Environment variables:** Ensure all required env vars are set in Vercel

### Runtime Errors

1. **CORS Issues**
   - Add your Vercel domain to Supabase allowed origins
   - Supabase Dashboard → Settings → API → CORS

2. **Environment Variables Not Working**
   - Ensure variables start with `VITE_` prefix
   - Redeploy after adding environment variables
   - Check variable names match exactly (case-sensitive)

3. **404 Errors on Routes**
   - The `vercel.json` file includes rewrites to handle SPA routing
   - If issues persist, check the rewrites configuration

### Performance Optimization

1. **Enable Edge Functions** (if needed)
   - Vercel automatically optimizes static assets
   - Consider code splitting for large bundles

2. **Image Optimization**
   - Use Vercel's Image Optimization API
   - Or use a CDN for static assets

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key | Yes |

## Useful Vercel Commands

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View deployment logs
vercel logs

# List all deployments
vercel ls

# Remove deployment
vercel remove
```

## Next Steps

- Set up monitoring and analytics
- Configure error tracking (e.g., Sentry)
- Set up automated testing in CI/CD
- Configure preview deployments for pull requests
- Set up staging environment

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Community](https://github.com/vercel/vercel/discussions)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

---

**Note:** Remember to keep your Supabase credentials secure and never commit them to your repository.

