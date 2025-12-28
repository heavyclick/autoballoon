"""
Payment Routes - LemonSqueezy Integration for Glass Wall
Handles checkout creation and webhook processing for 24h Pass, Monthly, and Yearly plans.
"""
from fastapi import APIRouter, Request, Header, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
import httpx
import hmac
import hashlib
import os
from datetime import datetime, timedelta

# Import Supabase client
from supabase import create_client, Client

router = APIRouter(prefix="/payments", tags=["Payments"])

# ======================
# LemonSqueezy Configuration
# ======================
LEMONSQUEEZY_API_KEY = os.getenv("LEMONSQUEEZY_API_KEY", "")
LEMONSQUEEZY_STORE_ID = os.getenv("LEMONSQUEEZY_STORE_ID", "")
LEMONSQUEEZY_WEBHOOK_SECRET = os.getenv("LEMONSQUEEZY_WEBHOOK_SECRET", "")

# Product Variant IDs
LEMONSQUEEZY_PASS_24H_VARIANT_ID = os.getenv("LEMONSQUEEZY_PASS_24H_VARIANT_ID", "")
LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID = os.getenv("LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID", "")
LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID = os.getenv("LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID", "")

APP_URL = os.getenv("APP_URL", "https://autoballoon.space")

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

class PricingResponse(BaseModel):
    pass_price: int = 49
    pro_price: int = 99
    yearly_price: int = 990  # Example: 10 months price for 12 months
    currency: str = "USD"
    pass_features: list[str]
    pro_features: list[str]

class CheckoutRequest(BaseModel):
    email: EmailStr
    plan_type: str  # 'pass_24h', 'pro_monthly', or 'pro_yearly'
    session_id: Optional[str] = None  # Guest session to restore after payment
    promo_code: Optional[str] = None

class CheckoutResponse(BaseModel):
    success: bool
    checkout_url: Optional[str] = None
    message: Optional[str] = None

# ==================
# API Endpoints
# ==================

@router.get("/pricing", response_model=PricingResponse)
async def get_pricing():
    """Get current pricing information"""
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
        ]
    )

@router.post("/create-checkout", response_model=CheckoutResponse)
async def create_checkout(request: CheckoutRequest):
    """Create a LemonSqueezy checkout session"""
    
    if not LEMONSQUEEZY_API_KEY:
        raise HTTPException(status_code=500, detail="Payment not configured")
    
    # Determine which variant to use
    variant_id = None
    if request.plan_type == "pass_24h":
        variant_id = LEMONSQUEEZY_PASS_24H_VARIANT_ID
    elif request.plan_type == "pro_monthly":
        variant_id = LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID
    elif request.plan_type == "pro_yearly":
        variant_id = LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID
    else:
        raise HTTPException(status_code=400, detail="Invalid plan type")
    
    if not variant_id:
        raise HTTPException(status_code=500, detail=f"Product variant not configured for {request.plan_type}")
    
    # Build success URL with session info
    success_url = f"{APP_URL}/payment-success"
    if request.session_id:
        success_url += f"?session_id={request.session_id}"
    
    try:
        async with httpx.AsyncClient() as client:
            checkout_payload = {
                "data": {
                    "type": "checkouts",
                    "attributes": {
                        "checkout_data": {
                            "email": request.email,
                            "custom": {
                                "user_email": request.email,
                                "session_id": request.session_id or "",
                                "plan_type": request.plan_type,
                            }
                        },
                        "checkout_options": {
                            "dark": True,  # Dark mode checkout
                            "success_url": success_url,
                            "button_color": "#E63946",  # Match brand color
                        },
                        "product_options": {
                            "redirect_url": success_url,
                        }
                    },
                    "relationships": {
                        "store": {
                            "data": {
                                "type": "stores",
                                "id": LEMONSQUEEZY_STORE_ID
                            }
                        },
                        "variant": {
                            "data": {
                                "type": "variants",
                                "id": variant_id
                            }
                        }
                    }
                }
            }
            
            # Add discount code if provided
            if request.promo_code:
                checkout_payload["data"]["attributes"]["checkout_data"]["discount_code"] = request.promo_code
            
            response = await client.post(
                "https://api.lemonsqueezy.com/v1/checkouts",
                headers={
                    "Authorization": f"Bearer {LEMONSQUEEZY_API_KEY}",
                    "Content-Type": "application/vnd.api+json",
                    "Accept": "application/vnd.api+json"
                },
                json=checkout_payload
            )
            
            if response.status_code == 201:
                data = response.json()
                checkout_url = data["data"]["attributes"]["url"]
                return CheckoutResponse(
                    success=True,
                    checkout_url=checkout_url
                )
            else:
                print(f"LemonSqueezy error: {response.status_code} - {response.text}")
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
    x_signature: Optional[str] = Header(None, alias="X-Signature")
):
    """Handle LemonSqueezy webhook events"""
    
    body = await request.body()
    
    # Verify webhook signature
    if LEMONSQUEEZY_WEBHOOK_SECRET and x_signature:
        expected_signature = hmac.new(
            LEMONSQUEEZY_WEBHOOK_SECRET.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected_signature, x_signature):
            raise HTTPException(status_code=401, detail="Invalid signature")
    
    payload = await request.json()
    event_name = payload.get("meta", {}).get("event_name")
    data = payload.get("data", {})
    attributes = data.get("attributes", {})
    custom_data = payload.get("meta", {}).get("custom_data", {})
    
    print(f"Webhook received: {event_name}")
    
    supabase = get_supabase()
    
    # Log the event
    if supabase:
        try:
            supabase.table("payment_events").insert({
                "email": custom_data.get("user_email"),
                "event_type": event_name,
                "provider": "lemonsqueezy",
                "provider_event_id": str(data.get("id", "")),
                "amount": attributes.get("total"),
                "currency": attributes.get("currency", "USD"),
                "product_type": custom_data.get("plan_type"),
                "raw_payload": payload,
                "created_at": datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            print(f"Error logging payment event: {e}")
    
    # Handle specific events
    if event_name == "order_created":
        await handle_order_created(payload, supabase)
    
    elif event_name == "subscription_created":
        await handle_subscription_created(payload, supabase)
    
    elif event_name == "subscription_cancelled":
        await handle_subscription_cancelled(payload, supabase)
    
    elif event_name == "subscription_payment_success":
        await handle_subscription_payment(payload, supabase)
    
    return {"status": "received"}

async def handle_order_created(payload: dict, supabase):
    """Handle one-time purchase (24-hour pass)"""
    custom_data = payload.get("meta", {}).get("custom_data", {})
    email = custom_data.get("user_email")
    plan_type = custom_data.get("plan_type")
    session_id = custom_data.get("session_id")
    
    if not email:
        return
    
    if plan_type != "pass_24h":
        return  # Only handle pass purchases here
    
    if not supabase:
        return
    
    try:
        # Get or create user
        user_result = supabase.table("users").select("id").eq(
            "email", email.lower()
        ).execute()
        
        if user_result.data and len(user_result.data) > 0:
            user_id = user_result.data[0]["id"]
            # Update existing user
            supabase.table("users").update({
                "plan_tier": "pass_24h",
                "pass_expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
                "is_pro": True,  # Temporary pro access
            }).eq("id", user_id).execute()
        else:
            # Create new user with pass
            result = supabase.table("users").insert({
                "email": email.lower(),
                "plan_tier": "pass_24h",
                "pass_expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
                "is_pro": True,
            }).execute()
            user_id = result.data[0]["id"] if result.data else None
        
        # Claim guest session if provided
        if session_id and user_id:
            supabase.table("guest_sessions").update({
                "is_claimed": True,
                "claimed_by": user_id,
            }).eq("session_id", session_id).execute()
        
        print(f"24-hour pass activated for {email}")
        
    except Exception as e:
        print(f"Error handling order: {e}")

async def handle_subscription_created(payload: dict, supabase):
    """Handle new Pro subscription (Monthly or Yearly)"""
    custom_data = payload.get("meta", {}).get("custom_data", {})
    data = payload.get("data", {})
    attributes = data.get("attributes", {})
    
    email = custom_data.get("user_email")
    session_id = custom_data.get("session_id")
    subscription_id = str(data.get("id", ""))
    customer_id = str(attributes.get("customer_id", ""))
    plan_type = custom_data.get("plan_type", "pro_monthly") # Default to monthly if missing
    
    if not email or not supabase:
        return
    
    try:
        # Get or create user
        user_result = supabase.table("users").select("id").eq(
            "email", email.lower()
        ).execute()
        
        if user_result.data and len(user_result.data) > 0:
            user_id = user_result.data[0]["id"]
            # Update to Pro
            supabase.table("users").update({
                "plan_tier": plan_type, # 'pro_monthly' or 'pro_yearly'
                "is_pro": True,
                "subscription_status": "active",
                "lemonsqueezy_subscription_id": subscription_id,
                "lemonsqueezy_customer_id": customer_id,
                "pass_expires_at": None,  # Clear any pass expiry
            }).eq("id", user_id).execute()
        else:
            # Create new Pro user
            result = supabase.table("users").insert({
                "email": email.lower(),
                "plan_tier": plan_type,
                "is_pro": True,
                "subscription_status": "active",
                "lemonsqueezy_subscription_id": subscription_id,
                "lemonsqueezy_customer_id": customer_id,
            }).execute()
            user_id = result.data[0]["id"] if result.data else None
        
        # Claim guest session
        if session_id and user_id:
            supabase.table("guest_sessions").update({
                "is_claimed": True,
                "claimed_by": user_id,
            }).eq("session_id", session_id).execute()
        
        print(f"Pro subscription ({plan_type}) activated for {email}")
        
    except Exception as e:
        print(f"Error handling subscription: {e}")

async def handle_subscription_cancelled(payload: dict, supabase):
    """Handle subscription cancellation"""
    data = payload.get("data", {})
    subscription_id = str(data.get("id", ""))
    
    if not supabase:
        return
    
    try:
        # Find user by subscription ID and downgrade
        # Note: In a real app you might want to wait until period_ends_at
        supabase.table("users").update({
            "subscription_status": "cancelled",
        }).eq("lemonsqueezy_subscription_id", subscription_id).execute()
        
        print(f"Subscription {subscription_id} cancelled")
        
    except Exception as e:
        print(f"Error handling cancellation: {e}")

async def handle_subscription_payment(payload: dict, supabase):
    """Handle successful subscription payment (renewal)"""
    data = payload.get("data", {})
    subscription_id = str(data.get("id", ""))
    
    if not supabase:
        return
    
    try:
        # Ensure user is still active
        supabase.table("users").update({
            "subscription_status": "active",
            "is_pro": True,
        }).eq("lemonsqueezy_subscription_id", subscription_id).execute()
        
    except Exception as e:
        print(f"Error handling payment: {e}")

@router.get("/check-access")
async def check_access(email: str):
    """Check if a user has export access (for frontend verification)"""
    supabase = get_supabase()
    if not supabase:
        return {"has_access": False, "reason": "Database not configured"}
    
    try:
        result = supabase.table("users").select(
            "is_pro, plan_tier, pass_expires_at, subscription_status"
        ).eq("email", email.lower()).single().execute()
        
        if not result.data:
            return {"has_access": False, "reason": "User not found"}
        
        user = result.data
        
        # Check Pro status (Active subscription)
        if user.get("is_pro") and user.get("subscription_status") == "active":
            return {"has_access": True, "plan": user.get("plan_tier", "pro")}
        
        # Check 24-hour pass
        if user.get("plan_tier") == "pass_24h" and user.get("pass_expires_at"):
            expires_at = datetime.fromisoformat(user["pass_expires_at"].replace("Z", "+00:00"))
            if expires_at > datetime.now(expires_at.tzinfo):
                return {"has_access": True, "plan": "pass_24h", "expires_at": user["pass_expires_at"]}
        
        # Check lifetime
        if user.get("plan_tier") == "pro_lifetime":
            return {"has_access": True, "plan": "pro_lifetime"}
        
        return {"has_access": False, "reason": "No active plan"}
        
    except Exception as e:
        print(f"Error checking access: {e}")
        return {"has_access": False, "reason": str(e)}
