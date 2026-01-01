# Railway Quick Start - Deploy Now! 🚀

**Fast-track deployment guide for AutoBalloon CIE**

---

## Prerequisites Checklist

Before starting, ensure you have:

- [x] GitHub repo pushed (✅ Done - https://github.com/heavyclick/autoballoon)
- [ ] Railway account (create at https://railway.app)
- [ ] Supabase project with migration run
- [ ] LemonSqueezy store with products created
- [ ] Google Cloud APIs enabled
- [ ] All API keys ready

---

## Step 1: Create Railway Project (2 minutes)

1. Go to **https://railway.app/new**
2. Click **"Deploy from GitHub repo"**
3. Authorize Railway to access your GitHub account
4. Select repository: **heavyclick/autoballoon**
5. Railway will auto-detect Next.js and start deploying
6. **Don't worry about errors** - we need to add environment variables first

---

## Step 2: Add Environment Variables (5 minutes)

In Railway dashboard:

1. Click on your project
2. Click **"Variables"** tab
3. Click **"+ New Variable"** or **"Raw Editor"** (easier for bulk paste)

### Copy-Paste Template

Click **"Raw Editor"** and paste this (replace with your actual values):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_SERVICE_ROLE_KEY

# Google APIs
NEXT_PUBLIC_GOOGLE_VISION_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# LemonSqueezy
LEMONSQUEEZY_API_KEY=LS-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LEMONSQUEEZY_STORE_ID=12345
LEMONSQUEEZY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_LEMONSQUEEZY_STORE_URL=https://yourstore.lemonsqueezy.com

# Product Variant IDs
LEMONSQUEEZY_TIER_20_VARIANT_ID=123456
LEMONSQUEEZY_TIER_99_VARIANT_ID=123457

# App Config
NEXT_PUBLIC_APP_URL=https://your-app.railway.app
NODE_ENV=production

# Pricing Tiers
TIER_20_DAILY_CAP=30
TIER_20_MONTHLY_CAP=150
TIER_99_DAILY_CAP=100
TIER_99_MONTHLY_CAP=500
```

**Important:** Update `NEXT_PUBLIC_APP_URL` after deployment (see Step 3)

4. Click **"Save"** or **"Update Variables"**
5. Railway will automatically redeploy with new environment variables

---

## Step 3: Get Your Railway URL (1 minute)

1. In Railway dashboard, click **"Settings"** tab
2. Scroll to **"Domains"**
3. You'll see a Railway-provided domain like: `autoballoon-production.up.railway.app`
4. **Copy this URL**

5. Go back to **"Variables"** tab
6. Update `NEXT_PUBLIC_APP_URL` to your Railway URL:
   ```
   NEXT_PUBLIC_APP_URL=https://autoballoon-production.up.railway.app
   ```
7. Click **"Save"** (this will trigger another deployment)

---

## Step 4: Run Supabase Database Migration (5 minutes)

**Critical:** You must run this migration before the app will work!

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **"SQL Editor"**
4. Click **"New Query"**
5. Copy the entire contents of:
   `/Users/Tk/Downloads/autoballoon-cie/supabase/migrations/001_initial_schema.sql`
6. Paste into the SQL editor
7. Click **"Run"** (or press Cmd/Ctrl + Enter)
8. You should see: **"Success. No rows returned"**

### Verify Tables Created

1. Go to **"Table Editor"** in Supabase
2. You should see 4 tables:
   - `users`
   - `usage`
   - `subscriptions`
   - `webhook_events`

If you see these tables, ✅ migration successful!

---

## Step 5: Configure Supabase Authentication (3 minutes)

1. In Supabase dashboard, go to **"Authentication"** → **"URL Configuration"**
2. Add your Railway URL to:
   - **Site URL**: `https://autoballoon-production.up.railway.app`
   - **Redirect URLs**: `https://autoballoon-production.up.railway.app/*`
3. Click **"Save"**

---

## Step 6: Configure LemonSqueezy Webhook (3 minutes)

**Critical:** This allows subscription events to update your database!

1. Go to LemonSqueezy dashboard: https://app.lemonsqueezy.com
2. Go to **"Settings"** → **"Webhooks"**
3. Click **"+ Add Endpoint"** (or edit existing)
4. Configure:
   - **URL**: `https://autoballoon-production.up.railway.app/api/webhooks/lemonsqueezy`
   - **Signing Secret**: Copy this and update Railway variable `LEMONSQUEEZY_WEBHOOK_SECRET`
   - **Events**:
     - ✓ `subscription_created`
     - ✓ `subscription_updated`
     - ✓ `subscription_cancelled`
     - ✓ `subscription_expired`
     - ✓ `subscription_payment_success`
5. Click **"Save"**

---

## Step 7: Wait for Deployment (2-3 minutes)

1. Go back to Railway dashboard
2. Click **"Deployments"** tab
3. Watch the build logs
4. Wait for status to show: **"Active"** with green checkmark

---

## Step 8: Test Your Deployment! 🎉

### Test 1: Visit Your App

1. Open your Railway URL in browser
2. You should see the AutoBalloon landing page
3. Check browser console (F12) for any errors

### Test 2: Upload Flow

1. Find a sample PDF (any engineering drawing)
2. Drag and drop onto the upload zone
3. Watch processing animation
4. Verify workbench appears with canvas

### Test 3: Paywall

1. Click green "Export" button
2. PaywallModal should appear
3. Select a plan
4. Click "Subscribe"
5. You should be redirected to LemonSqueezy checkout

### Test 4: Webhook (After Test Subscription)

1. In Supabase, go to **"Table Editor"** → **"webhook_events"**
2. After completing a test subscription, you should see events logged here
3. Check **"users"** table - should see user record with `is_pro: true`
4. Check **"subscriptions"** table - should see subscription record

---

## Troubleshooting

### Build Fails

**Error: "Cannot find module 'pnpm'"**

Railway should auto-detect pnpm. If not:
1. Check `package.json` has `"packageManager": "pnpm@9.0.0"` field
2. Or add in Railway Settings → Build Command: `npm install -g pnpm && pnpm install && pnpm build`

**Error: "Out of memory"**

1. Go to Railway Settings
2. Increase memory allocation
3. Redeploy

### Runtime Errors

**Error: "Missing environment variable"**

1. Check Railway Variables tab
2. Ensure ALL variables from Step 2 are present
3. Check for typos in variable names
4. Redeploy after adding missing variables

**Error: "Supabase client error"**

1. Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
2. Check Supabase project is active (not paused)
3. Verify migration was run successfully

**Error: "LemonSqueezy checkout failed"**

1. Verify `LEMONSQUEEZY_API_KEY` is correct (starts with `LS-`)
2. Check variant IDs are correct numbers
3. Test in LemonSqueezy test mode first

### Webhook Not Working

**Events not appearing in Supabase**

1. Check Railway logs: Go to **"Deployments"** → Click latest deployment → View logs
2. Search for webhook-related errors
3. Verify webhook URL in LemonSqueezy is correct
4. Check `LEMONSQUEEZY_WEBHOOK_SECRET` matches in both places
5. Test webhook manually in LemonSqueezy dashboard

---

## Post-Deployment Checklist

After successful deployment:

- [ ] App loads at Railway URL
- [ ] Can upload PDF and see processing
- [ ] Paywall modal appears on export
- [ ] LemonSqueezy checkout redirects work
- [ ] Webhook events logged in Supabase
- [ ] Test subscription creates user record
- [ ] Usage tracking works
- [ ] Export works after subscription

---

## Optional: Custom Domain

Want to use your own domain? (e.g., `app.autoballoon.com`)

1. In Railway Settings → **"Domains"**
2. Click **"Custom Domain"**
3. Enter your domain
4. Add CNAME record at your DNS provider:
   - Type: `CNAME`
   - Name: `app` (or whatever subdomain)
   - Value: `autoballoon-production.up.railway.app`
5. Update environment variables:
   - `NEXT_PUBLIC_APP_URL=https://app.autoballoon.com`
   - Update Supabase redirect URLs
   - Update LemonSqueezy webhook URL

---

## Monitoring & Logs

### View Application Logs

1. Railway dashboard → **"Deployments"**
2. Click on active deployment
3. View real-time logs

**Useful log searches:**
- `error` - Find errors
- `webhook` - Find webhook events
- `subscription` - Find subscription events

### Monitor Database

1. Supabase dashboard → **"Table Editor"**
2. Check `webhook_events` for processing status
3. Check `usage` for upload tracking
4. Check `subscriptions` for active subscriptions

---

## Cost Estimation

**Expected Monthly Costs:**

- **Railway Hobby**: $5/month (or free tier if available)
- **Supabase**: Free tier (up to 500MB database)
- **Google Cloud**: ~$5-10/month (Vision + Gemini APIs)
- **LemonSqueezy**: 5% + 50¢ per transaction

**Total**: ~$10-15/month + LemonSqueezy fees

---

## Next Steps

Once deployed and tested:

1. ✅ Create test subscription to verify full flow
2. ✅ Monitor logs for 24 hours
3. ✅ Set up usage reset cron job (see RAILWAY_DEPLOYMENT.md)
4. ✅ Add custom domain (optional)
5. ✅ Launch to users! 🚀

---

## Support Resources

- **Railway Status**: https://railway.app/status
- **Railway Docs**: https://docs.railway.app
- **Supabase Status**: https://status.supabase.com
- **LemonSqueezy Status**: https://status.lemonsqueezy.com

---

**Deployment Time**: ~20-30 minutes total
**Status**: Ready to deploy! 🚀

---

*Questions? Check the full RAILWAY_DEPLOYMENT.md for detailed troubleshooting.*
