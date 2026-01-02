# AutoBalloon CIE - Migration to Separated Architecture

## ✅ What Was Done

Successfully separated the Next.js monolith into:

### 🔹 Backend (Express API)
- **Location**: `/backend/`
- **Tech Stack**: Express + TypeScript
- **6 API Routes** migrated:
  - `/api/gemini` - Dimension parsing with Gemini
  - `/api/ocr` - Google Vision OCR
  - `/api/usage` - Usage tracking & limits
  - `/api/checkout` - LemonSqueezy checkout
  - `/api/export` - Excel export (AS9102)
  - `/api/webhooks` - LemonSqueezy webhooks

### 🔹 Frontend (Vite + React)
- **Location**: `/frontend/`
- **Tech Stack**: Vite + React + TypeScript + Tailwind
- **All components** copied intact (no changes needed!)
- **Zustand store** with IndexedDB persistence
- **API client** to communicate with backend

## 🚀 Quick Start - Local Testing

### 1. Setup Backend

```bash
cd backend
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Run development server
npm run dev
```

Backend runs on **http://localhost:3001**

### 2. Setup Frontend

```bash
cd ../frontend
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Run development server
npm run dev
```

Frontend runs on **http://localhost:5173**

### 3. Test It!

Open http://localhost:5173 in your browser.

The frontend will automatically proxy API calls to the backend.

## 📦 Environment Variables

### Backend (.env)
```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Google APIs
GOOGLE_VISION_API_KEY=AIzaSyxxx...
GEMINI_API_KEY=AIzaSyxxx...

# Resend
RESEND_API_KEY=re_xxx...

# LemonSqueezy
LEMONSQUEEZY_API_KEY=xxx
LEMONSQUEEZY_STORE_ID=xxx
LEMONSQUEEZY_WEBHOOK_SECRET=xxx
LEMONSQUEEZY_TIER_20_VARIANT_ID=xxx
LEMONSQUEEZY_TIER_99_VARIANT_ID=xxx

# Config
FRONTEND_URL=http://localhost:5173
PORT=3001
NODE_ENV=development
```

### Frontend (.env)
```env
# Backend API
VITE_API_URL=http://localhost:3001

# Supabase (PUBLIC keys only!)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
```

## 🌐 Deployment

### Backend → Railway

1. Create new Railway project
2. Connect GitHub repo
3. Set root directory: `/backend`
4. Add all environment variables from `.env.example`
5. Deploy!

Railway will auto-detect the Express app and deploy it.

**Important**: Update `FRONTEND_URL` to your actual frontend URL after deploying frontend.

### Frontend → Vercel / Netlify / Cloudflare Pages

#### Vercel:
```bash
cd frontend
vercel
```

#### Netlify:
```bash
cd frontend
npm run build
# Deploy dist/ folder
```

#### Or Railway (static site):
- Root directory: `/frontend`
- Build command: `npm run build`
- Output directory: `dist`

**Important**: Update `VITE_API_URL` to your Railway backend URL.

## 🎯 Why This Works

### Before (Next.js Monolith):
❌ SSR trying to run browser-only code
❌ Build failures with localforage/IndexedDB
❌ Fighting Next.js architecture

### After (Separated):
✅ **Frontend**: Pure SPA - builds to static files
✅ **Backend**: Pure API - no rendering confusion
✅ Each part uses the right tool
✅ No more build errors!

## 📝 Next Steps

1. ✅ Test locally (frontend + backend running together)
2. Deploy backend to Railway
3. Deploy frontend to Vercel/Netlify
4. Update Supabase database (run migrations if needed)
5. Configure LemonSqueezy webhook to point to Railway URL

## 🔧 Troubleshooting

**Backend won't start:**
- Check `.env` file exists
- Verify all API keys are present
- Check port 3001 is available

**Frontend can't connect to backend:**
- Verify backend is running on port 3001
- Check `VITE_API_URL` in frontend `.env`
- Open browser DevTools → Network tab to see API calls

**TypeScript errors:**
- Run `npm install` in both directories
- Delete `node_modules` and reinstall if needed

## 📚 Architecture Overview

```
autoballoon-cie/
├── backend/           ← Express API Server
│   ├── src/
│   │   ├── routes/    ← 6 API endpoints
│   │   ├── lib/       ← Supabase, Resend, LemonSqueezy
│   │   └── server.ts  ← Main entry point
│   └── package.json
│
├── frontend/          ← Vite React SPA
│   ├── src/
│   │   ├── components/  ← All React components (unchanged!)
│   │   ├── store/       ← Zustand + IndexedDB
│   │   ├── lib/         ← Supabase client, API client
│   │   └── App.tsx      ← Main app
│   └── package.json
│
└── (old Next.js files - can be deleted after testing)
```

## 🎉 Success!

Your app is now properly architected:
- Frontend: Fast, cacheable, deployable anywhere
- Backend: Simple, scalable, easy to maintain
- No more SSR headaches!
