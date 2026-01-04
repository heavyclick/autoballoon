"""
Payment Routes - Dodo Payments Integration
Handles checkout creation, webhook processing, and subscription management.
Replaces LemonSqueezy integration.
"""
from fastapi import APIRouter, Request, Header, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import httpx
import hmac
import hashlib
import os
from datetime import datetime

# Import Supabase client
from supabase import create_client, Client

# Import services
from services.auth_service import auth_service
from services.usage_tracking_service import usage_tracking_service

# Import config
from config import (
    PRICING_PLANS,
    DODO_PAYMENTS_API_KEY,
    DODO_PAYMENTS_WEBHOOK_SECRET,
    DODO_PAYMENTS_ENVIRONMENT,
    APP_URL,
)

router = APIRouter(prefix="/payments", tags=["Payments"])

# ======================
# Dodo Payments Configuration
# ======================
DODO_API_BASE_URL = (
    "https://test.dodopayments.com"
    if DODO_PAYMENTS_ENVIRONMENT == "test_mode"
    else "https://live.dodopayments.com"
)

# ======================
# Database Configuration
# ======================
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_supabase() -> Optional[Client]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ==================
# Request/Response Models
# ==================

class PlanFeature(BaseModel):
    text: str
    included: bool = True


class PlanInfo(BaseModel):
    id: str
    name: str
    price: int
    original_price: int
    billing: str
    daily_limit: int
    monthly_limit: int
    display_as_unlimited: bool
    features: List[str]


class PricingResponse(BaseModel):
    plans: List[PlanInfo]
    currency: str = "USD"


class CheckoutRequest(BaseModel):
    email: EmailStr
    plan_type: str  # 'lite_monthly', 'lite_annual', 'pro_monthly', or 'pro_annual'
    session_id: Optional[str] = None  # Guest session to restore after payment
    discount_code: Optional[str] = None
    callback_url: Optional[str] = None


class CheckoutResponse(BaseModel):
    success: bool
    checkout_url: Optional[str] = None
    session_id: Optional[str] = None
    message: Optional[str] = None


class UsageStatsResponse(BaseModel):
    has_subscription: bool
    plan_tier: Optional[str] = None
    display_text: Optional[str] = None
    show_counter: bool = False
    counter_type: Optional[str] = None
    daily_remaining: Optional[int] = None
    monthly_remaining: Optional[int] = None
    monthly_limit: Optional[int] = None
    can_upload: bool = False


# ==================
# API Endpoints
# ==================

@router.get("/pricing", response_model=PricingResponse)
async def get_pricing():
    """Get current pricing information with all plans"""

    lite_features = [
        "10 uploads per day",
        "100 uploads per month",
        "AS9102 Form 3 Excel exports",
        "Zero-storage security (ITAR/EAR ready)",
        "Email support",
    ]

    pro_features = [
        "Unlimited uploads (displayed)",
        "75 uploads/day, 500/month (actual)",
        "AS9102 Form 3 Excel exports",
        "Zero-storage security (ITAR/EAR ready)",
        "Priority processing speed",
        "Priority email support",
    ]

    plans = []
    for plan_id, plan_data in PRICING_PLANS.items():
        features = pro_features if "pro" in plan_id else lite_features
        plans.append(PlanInfo(
            id=plan_id,
            name=plan_data["name"],
            price=plan_data["price"],
            original_price=plan_data["original_price"],
            billing=plan_data["billing"],
            daily_limit=plan_data["daily_limit"],
            monthly_limit=plan_data["monthly_limit"],
            display_as_unlimited=plan_data["display_as_unlimited"],
            features=features
        ))

    return PricingResponse(plans=plans, currency="USD")


@router.post("/create-checkout", response_model=CheckoutResponse)
async def create_checkout(request: CheckoutRequest):
    """Create a Dodo Payments checkout session"""

    if not DODO_PAYMENTS_API_KEY:
        raise HTTPException(status_code=500, detail="Payment not configured")

    # Validate plan type
    if request.plan_type not in PRICING_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan type")

    plan = PRICING_PLANS[request.plan_type]
    product_id = plan.get("dodo_product_id")

    if not product_id:
        raise HTTPException(
            status_code=500,
            detail=f"Product ID not configured for {request.plan_type}"
        )

    # Build success URL with session info
    success_url = f"{APP_URL}/payment-success"
    if request.session_id:
        success_url += f"?session_id={request.session_id}"

    # Build metadata for webhook
    metadata = {
        "user_email": str(request.email),
        "plan_type": request.plan_type,
    }
    if request.session_id and str(request.session_id).strip():
        metadata["session_id"] = str(request.session_id).strip()

    try:
        async with httpx.AsyncClient() as client:
            checkout_payload = {
                "product_cart": [
                    {
                        "product_id": product_id,
                        "quantity": 1
                    }
                ],
                "return_url": success_url,
                "metadata": metadata,
                "customer": {
                    "email": str(request.email)
                }
            }

            # Add discount code if provided
            if request.discount_code:
                checkout_payload["discount_code"] = request.discount_code

            response = await client.post(
                f"{DODO_API_BASE_URL}/checkouts",
                headers={
                    "Authorization": f"Bearer {DODO_PAYMENTS_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=checkout_payload,
                timeout=30.0
            )

            if response.status_code == 200:
                data = response.json()
                checkout_url = data.get("checkout_url")
                session_id = data.get("session_id")

                if checkout_url:
                    return CheckoutResponse(
                        success=True,
                        checkout_url=checkout_url,
                        session_id=session_id
                    )
                else:
                    return CheckoutResponse(
                        success=False,
                        message="No checkout URL returned from payment provider"
                    )
            else:
                print(f"Dodo Payments error: {response.status_code} - {response.text}")
                return CheckoutResponse(
                    success=False,
                    message="Failed to create checkout. Please try again."
                )

    except Exception as e:
        print(f"Checkout error: {e}")
        raise HTTPException(status_code=500, detail="Payment service error")


@router.post("/webhook")
async def handle_webhook(
    request: Request,
    webhook_signature: Optional[str] = Header(None, alias="webhook-signature")
):
    """Handle Dodo Payments webhook events"""

    body = await request.body()

    # Verify webhook signature using HMAC-SHA256 (Standard Webhooks spec)
    if DODO_PAYMENTS_WEBHOOK_SECRET and webhook_signature:
        # Standard Webhooks format: t=timestamp,v1=signature
        try:
            parts = dict(part.split("=", 1) for part in webhook_signature.split(","))
            timestamp = parts.get("t", "")
            signature = parts.get("v1", "")

            # Construct the signed payload
            signed_payload = f"{timestamp}.{body.decode('utf-8')}"

            expected_signature = hmac.new(
                DODO_PAYMENTS_WEBHOOK_SECRET.encode(),
                signed_payload.encode(),
                hashlib.sha256
            ).hexdigest()

            if not hmac.compare_digest(expected_signature, signature):
                raise HTTPException(status_code=401, detail="Invalid signature")
        except Exception as e:
            print(f"Webhook signature verification error: {e}")
            # In development, continue anyway
            if DODO_PAYMENTS_ENVIRONMENT != "test_mode":
                raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_type = payload.get("type") or payload.get("event")
    data = payload.get("data", {})

    print(f"Webhook received: {event_type}")

    supabase = get_supabase()

    # Log the event
    if supabase:
        try:
            metadata = data.get("metadata", {})
            supabase.table("payment_events").insert({
                "email": metadata.get("user_email"),
                "event_type": event_type,
                "provider": "dodo",
                "provider_event_id": str(data.get("id", "")),
                "amount": data.get("amount"),
                "currency": data.get("currency", "USD"),
                "product_type": metadata.get("plan_type"),
                "raw_payload": payload,
                "created_at": datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            print(f"Error logging payment event: {e}")

    # Handle specific events
    if event_type == "payment.succeeded":
        await handle_payment_succeeded(payload, supabase)

    elif event_type == "subscription.active":
        await handle_subscription_active(payload, supabase)

    elif event_type == "subscription.renewed":
        await handle_subscription_renewed(payload, supabase)

    elif event_type == "subscription.cancelled":
        await handle_subscription_cancelled(payload, supabase)

    elif event_type == "subscription.failed":
        await handle_subscription_failed(payload, supabase)

    elif event_type == "subscription.on_hold":
        await handle_subscription_on_hold(payload, supabase)

    return {"status": "received"}


async def handle_payment_succeeded(payload: dict, supabase):
    """Handle successful payment"""
    data = payload.get("data", {})
    metadata = data.get("metadata", {})

    email = metadata.get("user_email")
    plan_type = metadata.get("plan_type")
    session_id = metadata.get("session_id")
    subscription_id = data.get("subscription_id")
    customer_id = data.get("customer_id")

    if not email:
        print("Payment succeeded but no email in metadata")
        return

    if not supabase:
        print("No database connection")
        return

    print(f"Processing payment for {email}, plan: {plan_type}")

    try:
        # Get or create user
        user_result = supabase.table("users").select("id").eq(
            "email", email.lower()
        ).execute()

        user_id = None

        if user_result.data and len(user_result.data) > 0:
            user_id = user_result.data[0]["id"]

            # Get plan limits
            plan = PRICING_PLANS.get(plan_type, {})
            daily_limit = plan.get("daily_limit", 0)
            monthly_limit = plan.get("monthly_limit", 0)

            # Update existing user
            supabase.table("users").update({
                "plan_tier": plan_type,
                "is_pro": True,
                "subscription_status": "active",
                "dodo_subscription_id": subscription_id,
                "dodo_customer_id": customer_id,
                "daily_limit": daily_limit,
                "monthly_limit": monthly_limit,
                "daily_uploads_count": 0,
                "monthly_uploads_count": 0,
                "daily_uploads_reset_at": datetime.utcnow().isoformat(),
                "monthly_uploads_reset_at": datetime.utcnow().isoformat(),
            }).eq("id", user_id).execute()
        else:
            # Get plan limits
            plan = PRICING_PLANS.get(plan_type, {})
            daily_limit = plan.get("daily_limit", 0)
            monthly_limit = plan.get("monthly_limit", 0)

            # Create new user
            result = supabase.table("users").insert({
                "email": email.lower(),
                "plan_tier": plan_type,
                "is_pro": True,
                "subscription_status": "active",
                "dodo_subscription_id": subscription_id,
                "dodo_customer_id": customer_id,
                "daily_limit": daily_limit,
                "monthly_limit": monthly_limit,
                "daily_uploads_count": 0,
                "monthly_uploads_count": 0,
            }).execute()
            user_id = result.data[0]["id"] if result.data else None

        # Claim guest session if provided
        if session_id and user_id:
            supabase.table("guest_sessions").update({
                "is_claimed": True,
                "claimed_by": user_id,
            }).eq("session_id", session_id).execute()

        print(f"Subscription ({plan_type}) activated for {email}")

        # Send Magic Link so they can log in
        try:
            auth_service.create_magic_link(email)
            print(f"Magic link sent to {email}")
        except Exception as e:
            print(f"Failed to send magic link: {e}")

    except Exception as e:
        print(f"Error handling payment: {e}")


async def handle_subscription_active(payload: dict, supabase):
    """Handle subscription activation"""
    # This is similar to payment_succeeded for subscriptions
    await handle_payment_succeeded(payload, supabase)


async def handle_subscription_renewed(payload: dict, supabase):
    """Handle successful subscription renewal"""
    data = payload.get("data", {})
    subscription_id = data.get("subscription_id") or data.get("id")

    if not supabase or not subscription_id:
        return

    try:
        # Ensure user is still active
        supabase.table("users").update({
            "subscription_status": "active",
            "is_pro": True,
        }).eq("dodo_subscription_id", subscription_id).execute()

        print(f"Subscription {subscription_id} renewed")

    except Exception as e:
        print(f"Error handling renewal: {e}")


async def handle_subscription_cancelled(payload: dict, supabase):
    """Handle subscription cancellation"""
    data = payload.get("data", {})
    subscription_id = data.get("subscription_id") or data.get("id")

    if not supabase or not subscription_id:
        return

    try:
        # Update user status - they keep access until period end
        supabase.table("users").update({
            "subscription_status": "cancelled",
        }).eq("dodo_subscription_id", subscription_id).execute()

        print(f"Subscription {subscription_id} cancelled")

    except Exception as e:
        print(f"Error handling cancellation: {e}")


async def handle_subscription_failed(payload: dict, supabase):
    """Handle failed subscription (mandate creation failed)"""
    data = payload.get("data", {})
    subscription_id = data.get("subscription_id") or data.get("id")

    if not supabase or not subscription_id:
        return

    try:
        supabase.table("users").update({
            "subscription_status": "failed",
            "is_pro": False,
        }).eq("dodo_subscription_id", subscription_id).execute()

        print(f"Subscription {subscription_id} failed")

    except Exception as e:
        print(f"Error handling subscription failure: {e}")


async def handle_subscription_on_hold(payload: dict, supabase):
    """Handle subscription on hold (payment failed)"""
    data = payload.get("data", {})
    subscription_id = data.get("subscription_id") or data.get("id")

    if not supabase or not subscription_id:
        return

    try:
        supabase.table("users").update({
            "subscription_status": "on_hold",
        }).eq("dodo_subscription_id", subscription_id).execute()

        print(f"Subscription {subscription_id} on hold")

    except Exception as e:
        print(f"Error handling subscription on hold: {e}")


@router.get("/check-access")
async def check_access(email: str):
    """Check if a user has export access"""
    supabase = get_supabase()
    if not supabase:
        return {"has_access": False, "reason": "Database not configured"}

    try:
        result = supabase.table("users").select(
            "is_pro, plan_tier, subscription_status, daily_limit, monthly_limit"
        ).eq("email", email.lower()).single().execute()

        if not result.data:
            return {"has_access": False, "reason": "User not found"}

        user = result.data

        # Check active subscription
        if user.get("is_pro") and user.get("subscription_status") == "active":
            # Check usage limits
            usage = usage_tracking_service.check_usage_limit(email)

            return {
                "has_access": usage.get("can_upload", False),
                "plan": user.get("plan_tier", "pro"),
                "daily_remaining": usage.get("daily_remaining"),
                "monthly_remaining": usage.get("monthly_remaining"),
                "limit_error": usage.get("limit_error")
            }

        return {"has_access": False, "reason": "No active subscription"}

    except Exception as e:
        print(f"Error checking access: {e}")
        return {"has_access": False, "reason": str(e)}


@router.get("/usage-stats", response_model=UsageStatsResponse)
async def get_usage_stats(email: str):
    """Get usage statistics for display in UI"""
    stats = usage_tracking_service.get_usage_stats(email)
    usage = usage_tracking_service.check_usage_limit(email)

    return UsageStatsResponse(
        has_subscription=stats.get("has_subscription", False),
        plan_tier=stats.get("plan_tier"),
        display_text=stats.get("display_text"),
        show_counter=stats.get("show_counter", False),
        counter_type=stats.get("counter_type"),
        daily_remaining=stats.get("daily_remaining"),
        monthly_remaining=stats.get("monthly_remaining"),
        monthly_limit=stats.get("monthly_limit"),
        can_upload=usage.get("can_upload", False)
    )


@router.post("/increment-usage")
async def increment_usage(email: str):
    """Increment usage after successful upload"""
    result = usage_tracking_service.increment_usage(email)

    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "Failed to increment usage")
        )

    return result
