"""
GLASS WALL - PROMO & ACCESS ROUTES
==================================

ADD THESE ROUTES TO YOUR EXISTING main.py FILE

These handle:
1. LinkedIn promo redemption (user enters email → gets 24h free)
2. Checking if user has access
3. LemonSqueezy checkout (when you're approved)
"""

# =============================================================================
# VALID PROMO CODES - Edit this list to add/remove promo codes
# =============================================================================

VALID_PROMO_CODES = {
    "LINKEDIN24": {"hours": 24, "type": "linkedin_promo"},
    "INFLUENCER": {"hours": 24, "type": "influencer"},
    "TWITTER24": {"hours": 24, "type": "twitter_promo"},
    "LAUNCH50": {"hours": 48, "type": "launch_promo"},
    # Add more codes here as needed
}


# =============================================================================
# ROUTE 1: REDEEM PROMO CODE
# User enters email + promo code → gets free access
# =============================================================================

from datetime import datetime, timedelta
import httpx  # pip install httpx
import os

@app.post("/api/promo/redeem")
async def redeem_promo(request: Request):
    """
    Frontend sends: {"email": "user@example.com", "promo_code": "LINKEDIN24"}
    Backend grants 24h access and returns success
    """
    data = await request.json()
    email = data.get("email", "").lower().strip()
    code = data.get("promo_code", "").upper().strip()
    
    # Validate
    if not email or "@" not in email:
        return JSONResponse({"success": False, "message": "Invalid email"}, status_code=400)
    
    if code not in VALID_PROMO_CODES:
        return JSONResponse({"success": False, "message": "Invalid promo code"}, status_code=400)
    
    promo = VALID_PROMO_CODES[code]
    expires_at = datetime.utcnow() + timedelta(hours=promo["hours"])
    
    try:
        # Check if already redeemed
        existing = await database.fetch_one(
            "SELECT id FROM access_passes WHERE email = :email AND pass_type = :pass_type",
            {"email": email, "pass_type": promo["type"]}
        )
        
        if existing:
            return JSONResponse({
                "success": False, 
                "message": "You've already used this promo code"
            }, status_code=400)
        
        # Grant access!
        await database.execute("""
            INSERT INTO access_passes (email, pass_type, granted_by, expires_at, is_active, created_at)
            VALUES (:email, :pass_type, :granted_by, :expires_at, true, NOW())
        """, {
            "email": email,
            "pass_type": promo["type"],
            "granted_by": f"promo_{code}",
            "expires_at": expires_at
        })
        
        return {
            "success": True,
            "message": f"Success! You have {promo['hours']} hours of free access.",
            "expires_at": expires_at.isoformat(),
            "hours": promo["hours"]
        }
        
    except Exception as e:
        print(f"Promo error: {e}")
        return JSONResponse({"success": False, "message": "Server error"}, status_code=500)


# =============================================================================
# ROUTE 2: CHECK IF USER HAS ACCESS
# Frontend calls this to see if user can download
# =============================================================================

@app.get("/api/access/check")
async def check_access(email: str = ""):
    """
    Frontend calls: GET /api/access/check?email=user@example.com
    Returns: {"has_access": true/false, "expires_at": "...", ...}
    """
    if not email:
        return {"has_access": False}
    
    email = email.lower().strip()
    
    try:
        result = await database.fetch_one("""
            SELECT pass_type, expires_at, granted_by
            FROM access_passes
            WHERE email = :email AND is_active = true
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC LIMIT 1
        """, {"email": email})
        
        if result:
            return {
                "has_access": True,
                "access_type": result["pass_type"],
                "expires_at": result["expires_at"].isoformat() if result["expires_at"] else None,
            }
        
        return {"has_access": False}
        
    except Exception as e:
        print(f"Access check error: {e}")
        return {"has_access": False}


# =============================================================================
# ROUTE 3: CREATE CHECKOUT (for LemonSqueezy - when ready)
# =============================================================================

@app.post("/api/payments/create-checkout")
async def create_checkout(request: Request):
    """
    Creates a LemonSqueezy checkout URL.
    Until LemonSqueezy is configured, returns a friendly message.
    """
    data = await request.json()
    email = data.get("email", "").lower().strip()
    plan_type = data.get("plan_type", "pass_24h")
    
    # Check if LemonSqueezy is configured
    api_key = os.getenv("LEMONSQUEEZY_API_KEY")
    store_id = os.getenv("LEMONSQUEEZY_STORE_ID")
    
    if not api_key or not store_id:
        return {
            "success": False,
            "message": "Payments coming soon! Use code LINKEDIN24 for free 24h access.",
            "show_promo": True
        }
    
    # Get variant ID based on plan
    variant_id = os.getenv("LEMONSQUEEZY_PASS_VARIANT_ID") if plan_type == "pass_24h" else os.getenv("LEMONSQUEEZY_PRO_VARIANT_ID")
    
    if not variant_id:
        return {"success": False, "message": "Product not configured"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.lemonsqueezy.com/v1/checkouts",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/vnd.api+json",
                    "Accept": "application/vnd.api+json"
                },
                json={
                    "data": {
                        "type": "checkouts",
                        "attributes": {
                            "checkout_data": {"email": email},
                            "product_options": {
                                "redirect_url": f"{os.getenv('FRONTEND_URL', 'https://autoballoon.space')}/payment-success?email={email}"
                            }
                        },
                        "relationships": {
                            "store": {"data": {"type": "stores", "id": store_id}},
                            "variant": {"data": {"type": "variants", "id": variant_id}}
                        }
                    }
                }
            )
            
            if response.status_code == 201:
                checkout_url = response.json()["data"]["attributes"]["url"]
                return {"success": True, "checkout_url": checkout_url}
            else:
                return {"success": False, "message": "Checkout failed"}
                
    except Exception as e:
        print(f"Checkout error: {e}")
        return {"success": False, "message": "Payment service unavailable"}


# =============================================================================
# ROUTE 4: LEMONSQUEEZY WEBHOOK
# LemonSqueezy calls this when someone pays → auto-grants access
# =============================================================================

@app.post("/webhooks/lemonsqueezy")
async def lemonsqueezy_webhook(request: Request):
    """
    LemonSqueezy sends payment confirmations here.
    When payment succeeds, user gets access automatically.
    """
    body = await request.body()
    payload = await request.json()
    
    event = payload.get("meta", {}).get("event_name")
    data = payload.get("data", {}).get("attributes", {})
    email = data.get("user_email", "").lower()
    
    if not email:
        return {"success": True}  # Ignore events without email
    
    try:
        if event == "order_created":
            # 24-hour pass purchased
            expires_at = datetime.utcnow() + timedelta(hours=24)
            await database.execute("""
                INSERT INTO access_passes (email, pass_type, granted_by, expires_at, is_active, created_at)
                VALUES (:email, 'pass_24h', 'lemonsqueezy_payment', :expires_at, true, NOW())
            """, {"email": email, "expires_at": expires_at})
        
        elif event == "subscription_created":
            # Pro monthly subscription
            await database.execute("""
                INSERT INTO access_passes (email, pass_type, granted_by, is_active, created_at)
                VALUES (:email, 'pro_monthly', 'lemonsqueezy_subscription', true, NOW())
            """, {"email": email})
        
        elif event in ["subscription_cancelled", "subscription_expired"]:
            await database.execute(
                "UPDATE access_passes SET is_active = false WHERE email = :email AND pass_type = 'pro_monthly'",
                {"email": email}
            )
        
        return {"success": True}
        
    except Exception as e:
        print(f"Webhook error: {e}")
        return {"success": False}


# =============================================================================
# REQUIRED IMPORTS - Add these at the top of your main.py
# =============================================================================
#
# from datetime import datetime, timedelta
# import httpx  # pip install httpx
# import os
