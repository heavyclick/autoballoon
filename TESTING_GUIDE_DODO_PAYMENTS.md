# Testing Guide: Dodo Payments Integration

This guide covers testing the new payment structure with Dodo Payments, the Lite/Pro plans, and usage tracking.

## Prerequisites

### Environment Variables

Add these to your `.env` file:

```bash
# Dodo Payments Configuration
DODO_PAYMENTS_API_KEY=your_dodo_api_key
DODO_PAYMENTS_WEBHOOK_SECRET=your_webhook_secret
DODO_PAYMENTS_ENVIRONMENT=test_mode  # Use "live_mode" for production

# Dodo Product IDs (create these in Dodo Payments dashboard)
DODO_LITE_MONTHLY_PRODUCT_ID=prod_lite_monthly_xxx
DODO_LITE_ANNUAL_PRODUCT_ID=prod_lite_annual_xxx
DODO_PRO_MONTHLY_PRODUCT_ID=prod_pro_monthly_xxx
DODO_PRO_ANNUAL_PRODUCT_ID=prod_pro_annual_xxx
```

### Database Migration

Run the SQL migration to add usage tracking columns:

```bash
# In Supabase SQL Editor, run:
# backend/migrations/003_add_usage_tracking.sql
```

---

## New Pricing Structure

### Lite Plan
- **Monthly**: ~~$39~~ $20/month (Grandfather Price)
- **Annual**: ~~$390~~ $200/year ($16.67/month equivalent)
- **Limits**: 10 uploads/day, 100 uploads/month
- **UI**: Shows "99/100 uploads remaining this month"

### Pro Plan
- **Monthly**: ~~$199~~ $99/month (Grandfather Price)
- **Annual**: ~~$1990~~ $990/year ($82.50/month equivalent)
- **Limits**: 75 uploads/day, 500 uploads/month
- **UI**: Displayed as "Unlimited", shows warning only at >70% daily usage

### Removed
- 24-hour pass option
- Free trial

---

## Testing Checklist

### 1. Pricing Display

- [ ] PricingCard shows Lite and Pro plans
- [ ] Strikethrough original prices displayed correctly
- [ ] "Grandfather Price" badge visible on both plans
- [ ] Monthly/Annual toggle works
- [ ] Correct prices for all 4 plans (lite_monthly, lite_annual, pro_monthly, pro_annual)

### 2. Checkout Flow

- [ ] Email validation works
- [ ] Plan selection persists through checkout
- [ ] Dodo checkout session created successfully
- [ ] User redirected to Dodo checkout page
- [ ] Success redirect returns to /payment-success

### 3. GlassWallPaywall Modal

- [ ] 24-hour pass option removed
- [ ] Only Lite and Pro plans shown
- [ ] Billing toggle (Monthly/Annual) works
- [ ] Grandfather Price badges visible
- [ ] Checkout buttons work correctly
- [ ] LemonSqueezy references replaced with Dodo Payments

### 4. Webhook Handling

Test with Dodo webhook events:

```bash
# Test payment.succeeded webhook
curl -X POST http://localhost:8000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "webhook-signature: t=1234567890,v1=test_signature" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_test123",
      "subscription_id": "sub_test123",
      "customer_id": "cus_test123",
      "amount": 2000,
      "metadata": {
        "user_email": "test@example.com",
        "plan_type": "lite_monthly"
      }
    }
  }'
```

Expected: User created/updated with plan_tier="lite_monthly", daily_limit=10, monthly_limit=100

### 5. Usage Tracking

#### Check Usage Limit
```bash
curl "http://localhost:8000/api/payments/check-access?email=test@example.com"
```

Expected response:
```json
{
  "has_access": true,
  "plan": "lite_monthly",
  "daily_remaining": 10,
  "monthly_remaining": 100
}
```

#### Get Usage Stats (for UI)
```bash
curl "http://localhost:8000/api/payments/usage-stats?email=test@example.com"
```

Expected for Lite users:
```json
{
  "has_subscription": true,
  "plan_tier": "lite_monthly",
  "display_text": "100/100 uploads remaining this month",
  "show_counter": true,
  "counter_type": "info"
}
```

Expected for Pro users (under 70% daily usage):
```json
{
  "has_subscription": true,
  "plan_tier": "pro_monthly",
  "display_text": null,
  "show_counter": false
}
```

Expected for Pro users (over 70% daily usage):
```json
{
  "has_subscription": true,
  "plan_tier": "pro_monthly",
  "display_text": "You've used 75% of your daily limit",
  "show_counter": true,
  "counter_type": "warning"
}
```

#### Increment Usage
```bash
curl -X POST "http://localhost:8000/api/payments/increment-usage?email=test@example.com"
```

### 6. UsageCounter Component

- [ ] Lite users see "X/100 uploads remaining this month"
- [ ] Pro users see nothing when under 70% daily usage
- [ ] Pro users see warning when over 70% daily usage
- [ ] Counter updates after each upload

### 7. Subscription Events

Test these webhook events:

| Event | Expected Behavior |
|-------|-------------------|
| `payment.succeeded` | Create/update user, set plan limits |
| `subscription.active` | Activate subscription |
| `subscription.renewed` | Keep user active |
| `subscription.cancelled` | Set status to "cancelled" |
| `subscription.failed` | Set is_pro=false |
| `subscription.on_hold` | Set status to "on_hold" |

---

## Database Verification

After successful payment, verify user record:

```sql
SELECT
  email,
  plan_tier,
  is_pro,
  subscription_status,
  daily_limit,
  monthly_limit,
  daily_uploads_count,
  monthly_uploads_count,
  dodo_subscription_id,
  dodo_customer_id
FROM users
WHERE email = 'test@example.com';
```

Expected for Lite Monthly:
```
plan_tier: "lite_monthly"
daily_limit: 10
monthly_limit: 100
```

Expected for Pro Monthly:
```
plan_tier: "pro_monthly"
daily_limit: 75
monthly_limit: 500
```

---

## Dodo Payments Dashboard Setup

### 1. Create Products

In Dodo Payments dashboard, create 4 subscription products:

| Product Name | Price | Billing |
|--------------|-------|---------|
| AutoBalloon Lite Monthly | $20 | Monthly |
| AutoBalloon Lite Annual | $200 | Yearly |
| AutoBalloon Pro Monthly | $99 | Monthly |
| AutoBalloon Pro Annual | $990 | Yearly |

### 2. Configure Webhooks

Set webhook URL to: `https://yourdomain.com/api/payments/webhook`

Enable these events:
- payment.succeeded
- payment.failed
- subscription.active
- subscription.renewed
- subscription.cancelled
- subscription.failed
- subscription.on_hold

### 3. Get Signing Key

Copy the webhook signing key and add to `DODO_PAYMENTS_WEBHOOK_SECRET`

---

## Troubleshooting

### Checkout Not Creating

1. Check DODO_PAYMENTS_API_KEY is set
2. Check product IDs are configured in .env
3. Check Dodo API response in logs

### Webhook Not Processing

1. Check webhook signature verification
2. Check DODO_PAYMENTS_WEBHOOK_SECRET matches dashboard
3. Check event type matches expected format

### Usage Not Tracking

1. Verify database migration was run
2. Check user has plan_tier, daily_limit, monthly_limit set
3. Check reset timestamps are recent

### UI Not Showing Counters

1. Check user is authenticated
2. Check isPro is true
3. Check usage-stats endpoint returns show_counter: true

---

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payments/pricing` | GET | Get all plan info |
| `/api/payments/create-checkout` | POST | Create Dodo checkout |
| `/api/payments/webhook` | POST | Handle Dodo webhooks |
| `/api/payments/check-access` | GET | Check user access |
| `/api/payments/usage-stats` | GET | Get UI usage display |
| `/api/payments/increment-usage` | POST | Increment counters |

---

## Files Modified

### Backend
- `backend/config.py` - Added Dodo config and PRICING_PLANS
- `backend/main.py` - Updated USAGE_CAPS
- `backend/api/payment_routes_v2.py` - Replaced LemonSqueezy with Dodo
- `backend/services/usage_tracking_service.py` - New file
- `backend/migrations/003_add_usage_tracking.sql` - New file

### Frontend
- `frontend/src/components/PricingCard.jsx` - Updated for Lite/Pro
- `frontend/src/components/GlassWallPaywall.jsx` - Removed 24h pass
- `frontend/src/components/UsageCounter.jsx` - New file

---

## Production Deployment

1. Set `DODO_PAYMENTS_ENVIRONMENT=live_mode`
2. Use production API key and product IDs
3. Run database migration
4. Test with a $1 test product first
5. Monitor webhook delivery in Dodo dashboard
