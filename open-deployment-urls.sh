#!/bin/bash

# AutoBalloon CIE - Open All Deployment URLs
# Run this script to open all necessary deployment dashboards

echo "🚀 Opening deployment dashboards..."
echo ""

# Railway
echo "📦 Opening Railway..."
open "https://railway.app/new"
sleep 2

# Supabase
echo "🗄️  Opening Supabase..."
open "https://supabase.com/dashboard"
sleep 2

# LemonSqueezy
echo "💳 Opening LemonSqueezy..."
open "https://app.lemonsqueezy.com"
sleep 2

# Google Cloud
echo "☁️  Opening Google Cloud Console..."
open "https://console.cloud.google.com"
sleep 2

# GitHub Repo
echo "📂 Opening GitHub Repository..."
open "https://github.com/heavyclick/autoballoon"

echo ""
echo "✅ All dashboards opened!"
echo ""
echo "Next steps:"
echo "1. Read: RAILWAY_QUICK_START.md"
echo "2. Follow: DEPLOY_CHECKLIST.txt"
echo "3. Estimated time: 20-30 minutes"
echo ""
