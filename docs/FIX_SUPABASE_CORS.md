# Fix Supabase CORS Errors

## Problem

You're seeing CORS errors like:
```
Access to fetch at 'https://rqssjgiunwyjeyutgkkp.supabase.co/rest/v1/...' 
from origin 'http://localhost:5173' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Solution: Configure CORS in Supabase Dashboard

### Step 1: Access Supabase Dashboard

1. Go to: **https://supabase.com/dashboard**
2. Select your project: **rqssjgiunwyjeyutgkkp**

### Step 2: Configure CORS Settings

**Option A: Via API Settings (Recommended)**

1. Go to: **Settings** → **API**
2. Scroll down to **CORS Configuration** section
3. Add your origins to the **Allowed Origins** list:
   ```
   http://localhost:5173
   http://localhost:3000
   https://console-mana.com
   https://www.console-mana.com
   https://mana-smart-scent.vercel.app
   ```
4. Click **Save**

**Option B: Via Project Settings**

1. Go to: **Settings** → **General**
2. Look for **CORS** or **Allowed Origins** section
3. Add your origins (same as above)
4. Click **Save**

### Step 3: Verify Configuration

After saving, wait 1-2 minutes for changes to propagate, then:

1. **Refresh your browser** (hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`)
2. **Check browser console** - CORS errors should be gone
3. **Test API calls** - They should work now

## Alternative: Check if CORS is Disabled

If you can't find CORS settings, it might be because:

1. **Your Supabase plan doesn't support custom CORS** (Free plan should support it)
2. **CORS is configured at a different level** (check with Supabase support)

## Quick Test

After configuring CORS, test with this in browser console:

```javascript
fetch('https://rqssjgiunwyjeyutgkkp.supabase.co/rest/v1/company_branding?select=*&limit=1', {
  headers: {
    'apikey': 'YOUR_ANON_KEY',
    'Authorization': 'Bearer YOUR_ANON_KEY'
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error)
```

Should return data without CORS errors.

## Common Issues

### Issue 1: Changes Not Taking Effect

- **Wait 1-2 minutes** after saving
- **Hard refresh** browser (`Ctrl+Shift+R`)
- **Clear browser cache**
- **Restart dev server** (`npm run dev`)

### Issue 2: Still Getting CORS Errors

1. **Verify origin is correct** - Check exact URL in browser address bar
2. **Check for typos** - `http://localhost:5173` vs `https://localhost:5173`
3. **Try adding wildcard** - Some Supabase projects allow `http://localhost:*`
4. **Check Supabase status** - Visit https://status.supabase.com

### Issue 3: Production Domain Not Working

1. **Add production domain** to allowed origins:
   ```
   https://console-mana.com
   https://www.console-mana.com
   ```
2. **Include protocol** - Must include `https://`
3. **No trailing slash** - Don't add `/` at the end

## Notes

- **Supabase REST API** should handle CORS automatically, but custom restrictions may override this
- **Edge Functions** have separate CORS configuration (already fixed in our code)
- **Local development** requires `http://localhost:5173` to be in allowed origins
- **Production domains** must be added separately

## Still Having Issues?

1. **Check Supabase Dashboard** → **Settings** → **API** → **CORS**
2. **Contact Supabase Support** if CORS settings are not available
3. **Check project plan** - Some plans may have CORS restrictions

---

**After fixing CORS, all your REST API calls should work!** 🎉

