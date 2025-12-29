"""
Payment Routes - LemonSqueezy Integration for Glass Wall
Handles checkout creation, webhook processing, and account activation.
"""

from fastapi import APIRouter, Request, Header, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
import httpx
import hmac
import hashlib
import os
from datetime import datetime, timedelta

# Supabase
from supabase import create_client, Client

# Auth
from services.auth_service import auth_service

# ------------------------------------------------------------------------------
# Router
# ------------------------------------------------------------------------------
router = APIRouter(prefix="/api/payments", tags=["Payments"])

# ------------------------------------------------------------------------------
# LemonSqueezy Config
# ------------------------------------------------------------------------------
LEMONSQUEEZY_API_KEY = os.getenv("LEMONSQUEEZY_API_KEY", "")
LEMONSQUEEZY_STORE_ID = os.getenv("LEMONSQUEEZY_STORE_ID", "")
LEMONSQUEEZY_WEBHOOK_SECRET = os.getenv("LEMONSQUEEZY_WEBHOOK_SECRET", "")

LEMONSQUEEZY_PASS_24H_VARIANT_ID = os.getenv("LEMONSQUEEZY_PASS_24H_VARIANT_ID", "")
LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID = os.getenv("LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID", "")
LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID = os.getenv("LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID", "")

APP_URL = os.getenv("APP_URL", "https://autoballoon.space")

# ------------------------------------------------------------------------------
# Supabase
# ------------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

def get_supabase() -> Optional[Client]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ------------------------------------------------------------------------------
# Models
# ------------------------------------------------------------------------------
class PricingResponse(BaseModel):
    pass_price: int = 49
    pro_price: int = 99
    yearly_price: int = 990
    currency: str = "USD"
    pass_features: list[str]
    pro_features: list[str]

class CheckoutRequest(BaseModel):
    email: EmailStr
    plan_type: str
    session_id: Optional[str] = None
    promo_code: Optional[str] = None
    callback_url: Optional[str] = None

class CheckoutResponse(BaseModel):
    success: bool
    checkout_url: Optional[str] = None
    message: Optional[str] = None

# ------------------------------------------------------------------------------
# Pricing
# ------------------------------------------------------------------------------
@router.get("/pricing", response_model=PricingResponse)
async def get_pricing():
    return PricingResponse(
        pass_price=49,
        pro_price=99,
        yearly_price=990,
        currency="USD",
        pass_features=[
            "Download this file immediately",
            "Unlimited exports for 24 hours",
            "No subscription, no auto-renewal",
        ],
        pro_features=[
            "Everything in Pass, plus:",
            "Unlimited projects forever",
            "Cloud storage & revision history",
            "Priority support",
            "Rate locked for life",
        ],
    )

# ------------------------------------------------------------------------------
# Create Checkout
# ------------------------------------------------------------------------------
@router.post("/create-checkout", response_model=CheckoutResponse)
async def create_checkout(request: CheckoutRequest):

    if not LEMONSQUEEZY_API_KEY:
        raise HTTPException(status_code=500, detail="Payment not configured")

    # Variant resolution
    variant_map = {
        "pass_24h": LEMONSQUEEZY_PASS_24H_VARIANT_ID,
        "pro_monthly": LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID,
        "pro_yearly": LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID,
    }

    variant_id = variant_map.get(request.plan_type)
    if not variant_id:
        raise HTTPException(status_code=400, detail="Invalid plan type")

    # Success URL
    base_success_url = request.callback_url or f"{APP_URL}/payment-success"
    safe_session_id = (
        request.session_id
        if isinstance(request.session_id, str) and request.session_id.strip()
        else ""
    )

    success_url = base_success_url
    if safe_session_id:
        separator = "&" if "?" in base_success_url else "?"
        success_url = f"{base_success_url}{separator}session_id={safe_session_id}"

    # Custom data (STRICT STRINGS ONLY)
    custom_data = {
        "user_email": request.email,
        "plan_type": request.plan_type,
        "session_id": safe_session_id,
    }

    checkout_payload = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "checkout_data": {
                    "email": request.email,
                    "custom": custom_data,
                },
                "checkout_options": {
                    "dark": True,
                    "button_color": "#E63946",
                },
                "product_options": {
                    "redirect_url": success_url,
                    "receipt_button_text": "Go to Dashboard",
                    "receipt_link_url": APP_URL,
                },
            },
            "relationships": {
                "store": {
                    "data": {"type": "stores", "id": LEMONSQUEEZY_STORE_ID}
                },
                "variant": {
                    "data": {"type": "variants", "id": variant_id}
                },
            },
        }
    }

    if request.promo_code:
        checkout_payload["data"]["attributes"]["checkout_data"]["discount_code"] = request.promo_code

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.lemonsqueezy.com/v1/checkouts",
                headers={
                    "Authorization": f"Bearer {LEMONSQUEEZY_API_KEY}",
                    "Content-Type": "application/vnd.api+json",
                    "Accept": "application/vnd.api+json",
                },
                json=checkout_payload,
            )

        if response.status_code == 201:
            data = response.json()
            return CheckoutResponse(
                success=True,
                checkout_url=data["data"]["attributes"]["url"],
            )

        print("LemonSqueezy error:", response.status_code, response.text)
        return CheckoutResponse(success=False, message="Failed to create checkout")

    except Exception as e:
        print("Checkout exception:", e)
        raise HTTPException(status_code=500, detail="Payment service error")

# ------------------------------------------------------------------------------
# Webhook
# ------------------------------------------------------------------------------
@router.post("/webhook")
async def handle_webhook(
    request: Request,
    x_signature: Optional[str] = Header(None, alias="X-Signature"),
):

    body = await request.body()

    if LEMONSQUEEZY_WEBHOOK_SECRET and x_signature:
        expected = hmac.new(
            LEMONSQUEEZY_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, x_signature):
            raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_name = payload.get("meta", {}).get("event_name")
    custom_data = payload.get("meta", {}).get("custom_data", {})

    supabase = get_supabase()

    if event_name == "order_created":
        await handle_order_created(payload, supabase)

    elif event_name == "subscription_created":
        await handle_subscription_created(payload, supabase)

    elif event_name == "subscription_cancelled":
        await handle_subscription_cancelled(payload, supabase)

    elif event_name == "subscription_payment_success":
        await handle_subscription_payment(payload, supabase)

    return {"status": "ok"}

# ------------------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------------------
async def handle_order_created(payload: dict, supabase):
    custom = payload.get("meta", {}).get("custom_data", {})
    email = custom.get("user_email")
    plan = custom.get("plan_type")
    session_id = custom.get("session_id")

    if plan != "pass_24h" or not email or not supabase:
        return

    expires = datetime.utcnow() + timedelta(hours=24)

    result = supabase.table("users").select("id").eq("email", email.lower()).execute()
    if result.data:
        user_id = result.data[0]["id"]
        supabase.table("users").update({
            "plan_tier": "pass_24h",
            "is_pro": True,
            "pass_expires_at": expires.isoformat(),
        }).eq("id", user_id).execute()
    else:
        insert = supabase.table("users").insert({
            "email": email.lower(),
            "plan_tier": "pass_24h",
            "is_pro": True,
            "pass_expires_at": expires.isoformat(),
        }).execute()
        user_id = insert.data[0]["id"]

    if session_id:
        supabase.table("guest_sessions").update({
            "is_claimed": True,
            "claimed_by": user_id,
        }).eq("session_id", session_id).execute()

    auth_service.create_magic_link(email)

async def handle_subscription_created(payload: dict, supabase):
    custom = payload.get("meta", {}).get("custom_data", {})
    email = custom.get("user_email")
    plan = custom.get("plan_type")
    session_id = custom.get("session_id")

    data = payload.get("data", {})
    attrs = data.get("attributes", {})

    if not email or not supabase:
        return

    values = {
        "plan_tier": plan,
        "is_pro": True,
        "subscription_status": "active",
        "lemonsqueezy_subscription_id": str(data.get("id")),
        "lemonsqueezy_customer_id": str(attrs.get("customer_id")),
        "pass_expires_at": None,
    }

    result = supabase.table("users").select("id").eq("email", email.lower()).execute()
    if result.data:
        user_id = result.data[0]["id"]
        supabase.table("users").update(values).eq("id", user_id).execute()
    else:
        insert = supabase.table("users").insert(
            {"email": email.lower(), **values}
        ).execute()
        user_id = insert.data[0]["id"]

    if session_id:
        supabase.table("guest_sessions").update({
            "is_claimed": True,
            "claimed_by": user_id,
        }).eq("session_id", session_id).execute()

    auth_service.create_magic_link(email)

async def handle_subscription_cancelled(payload: dict, supabase):
    if not supabase:
        return
    sub_id = str(payload.get("data", {}).get("id"))
    supabase.table("users").update({
        "subscription_status": "cancelled"
    }).eq("lemonsqueezy_subscription_id", sub_id).execute()

async def handle_subscription_payment(payload: dict, supabase):
    if not supabase:
        return
    sub_id = str(payload.get("data", {}).get("id"))
    supabase.table("users").update({
        "subscription_status": "active",
        "is_pro": True,
    }).eq("lemonsqueezy_subscription_id", sub_id).execute()
