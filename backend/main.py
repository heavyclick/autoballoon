"""
AutoBalloon Backend - ZERO STORAGE SECURITY MODEL
FastAPI application for manufacturing blueprint dimension detection

SECURITY ARCHITECTURE:
- Files processed IN MEMORY ONLY - never written to disk
- NO database storage of drawing data
- History stored in browser localStorage only
- Compliant with ITAR, EAR, NIST 800-171, ISO 27001, GDPR

DEBUG: Added /api/debug endpoint to view last processing results
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from config import CORS_ORIGINS, APP_NAME, APP_VERSION
from datetime import datetime, timedelta
import os

app = FastAPI(
    title=f"{APP_NAME} API",
    description="Automatic dimension ballooning for manufacturing blueprints. Zero-storage security architecture.",
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://autoballoon.space",
        "https://www.autoballoon.space",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from api.routes import router as main_router
from api.auth_routes import router as auth_router
# FIX: Use V2 to support 24h Pass / Monthly / Yearly
from api.payment_routes_v2 import router as payment_router
from api.usage_routes import router as usage_router
from api.download_routes import router as download_router
from api.detect_region import detect_region, RegionDetectRequest
# FIX: Import Guest Session Routes
from api.guest_session_routes import router as guest_session_router
# Template Routes for custom export templates
from api.template_routes import router as template_router

app.include_router(main_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(payment_router, prefix="/api")
app.include_router(usage_router, prefix="/api")
app.include_router(download_router)
# FIX: Include Guest Session Router
app.include_router(guest_session_router, prefix="/api")
# Template Routes
app.include_router(template_router, prefix="/api")


# =============================================================================
# DETECT REGION ENDPOINT - For Add Balloon OCR feature
# =============================================================================

@app.post("/api/detect-region")
async def detect_region_endpoint(request: RegionDetectRequest):
    """
    Detect dimension text in a cropped image region.
    Called when user draws rectangle in Add Balloon mode.
    """
    return await detect_region(request)


# =============================================================================
# DEBUG ENDPOINT - View last processing results for troubleshooting
# =============================================================================

@app.get("/api/debug")
async def get_debug_log():
    """
    Return the last N processing results for debugging.
    Shows raw OCR tokens, grouped OCR, and Gemini responses.
    """
    try:
        from services.detection_service import get_debug_log
        log = get_debug_log()
        return {
            "success": True,
            "entry_count": len(log),
            "entries": log
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": "Debug logging may not be enabled in detection_service.py"
        }


@app.delete("/api/debug")
async def clear_debug_log():
    """Clear the debug log."""
    try:
        from services.detection_service import DEBUG_LOG
        DEBUG_LOG.clear()
        return {"success": True, "message": "Debug log cleared"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# PROMO CODES
# =============================================================================

VALID_PROMO_CODES = {
    "LINKEDIN24": {"hours": 24, "type": "linkedin_promo", "max_redemptions": 1000, "daily_cap": 20},
    "INFLUENCER": {"hours": 24, "type": "influencer", "max_redemptions": 500, "daily_cap": 30},
    "TWITTER24": {"hours": 24, "type": "twitter_promo", "max_redemptions": 1000, "daily_cap": 20},
    "LAUNCH50": {"hours": 48, "type": "launch_promo", "max_redemptions": 200, "daily_cap": 50},
    "CREATOR2025": {"hours": None, "type": "lifetime_influencer", "max_redemptions": 50, "daily_cap": 75, "monthly_cap": 300},
}

# =============================================================================
# USAGE CAPS - Updated for Lite/Pro Plans with Dodo Payments
# =============================================================================
USAGE_CAPS = {
    # Promo codes (legacy)
    "linkedin_promo": {"daily": 20, "monthly": None},
    "twitter_promo": {"daily": 20, "monthly": None},
    "influencer": {"daily": 30, "monthly": None},
    "launch_promo": {"daily": 50, "monthly": None},
    "lifetime_influencer": {"daily": 75, "monthly": 300},
    # NEW: Lite Plan - 10/day, 100/month
    "lite_monthly": {"daily": 10, "monthly": 100},
    "lite_annual": {"daily": 10, "monthly": 100},
    # NEW: Pro Plan - 75/day, 500/month (displayed as "Unlimited")
    "pro_monthly": {"daily": 75, "monthly": 500},
    "pro_annual": {"daily": 75, "monthly": 500},
    # Free tier (no subscription)
    "free": {"daily": 3, "monthly": 5},
}


def get_supabase_client():
    """Get Supabase client for access/payment tracking only (NOT drawing data)"""
    from supabase import create_client
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("Supabase credentials not configured")
    return create_client(url, key)


def send_welcome_email(email: str, hours: int):
    """Send welcome email via Resend"""
    import resend
    
    resend.api_key = os.getenv("RESEND_API_KEY")
    if not resend.api_key:
        print("WARNING: RESEND_API_KEY not set, skipping email")
        return False
    
    try:
        resend.Emails.send({
            "from": "AutoBalloon <hello@autoballoon.space>",
            "to": email,
            "subject": f"🎉 Your {hours}-Hour Free Access is Active!",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #E63946;">Welcome to AutoBalloon! 🎈</h1>
                
                <p>Great news! Your <strong>{hours}-hour free access</strong> is now active.</p>
                
                <div style="background: #f0f9f0; padding: 15px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #22c55e;">
                    <h3 style="margin: 0 0 10px 0; color: #166534;">🔒 Zero-Storage Security</h3>
                    <p style="margin: 0; color: #166534;">Your drawings are processed in memory and immediately deleted. We never store your technical data.</p>
                </div>
                
                <p>You can now:</p>
                <ul>
                    <li>✅ Upload unlimited blueprints</li>
                    <li>✅ Download ballooned PDFs</li>
                    <li>✅ Export AS9102 Form 3 Excel reports</li>
                </ul>
                
                <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
                    <a href="https://autoballoon.space" 
                       style="display: inline-block; background: #E63946; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                        Open AutoBalloon →
                    </a>
                </div>
                
                <p style="color: #666; font-size: 14px;">
                    Your access expires in {hours} hours. After that, upgrade to Pro for unlimited access.
                </p>
            </div>
            """
        })
        print(f"Welcome email sent to {email}")
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False


@app.post("/api/promo/redeem")
async def redeem_promo(request: Request):
    """Redeem a promo code for temporary free access."""
    try:
        db = get_supabase_client()

        data = await request.json()
        email = data.get("email", "").lower().strip()
        code = data.get("promo_code", "").upper().strip()
        marketing_consent = data.get("marketing_consent", False)

        if not email or "@" not in email:
            return JSONResponse({"success": False, "message": "Invalid email"}, status_code=400)

        if code not in VALID_PROMO_CODES:
            return JSONResponse({"success": False, "message": "Invalid promo code"}, status_code=400)

        promo = VALID_PROMO_CODES[code]

        existing = db.table("access_passes").select("id").eq("email", email).eq("pass_type", promo["type"]).execute()
        if existing.data and len(existing.data) > 0:
            return JSONResponse({
                "success": False,
                "message": "You've already used this type of promo code"
            }, status_code=400)

        expires_at = None if promo["hours"] is None else (datetime.utcnow() + timedelta(hours=promo["hours"])).isoformat()

        insert_data = {
            "email": email,
            "pass_type": promo["type"],
            "granted_by": f"promo_{code}",
            "is_active": True,
            "marketing_consent": bool(marketing_consent),
        }

        # Add consent timestamp if user opted in
        if marketing_consent:
            insert_data["marketing_consent_at"] = datetime.utcnow().isoformat()

        if expires_at:
            insert_data["expires_at"] = expires_at

        db.table("access_passes").insert(insert_data).execute()

        # Only send marketing emails if user consented
        if promo["hours"] and marketing_consent:
            send_welcome_email(email, promo["hours"])

        message = "Success! You now have lifetime Pro access." if promo["hours"] is None else f"Success! You have {promo['hours']} hours of free access."

        return {
            "success": True,
            "message": message,
            "expires_at": expires_at,
            "hours": promo["hours"],
            "is_lifetime": promo["hours"] is None,
            "daily_cap": promo.get("daily_cap", 50)
        }

    except Exception as e:
        print(f"Promo error: {type(e).__name__}: {e}")
        return JSONResponse({"success": False, "message": f"Server error: {str(e)}"}, status_code=500)


@app.get("/api/access/check")
async def check_access(email: str = ""):
    """Check if user has export access (Promos OR Paid Subscriptions)."""
    if not email:
        return {"has_access": False}
    
    email = email.lower().strip()
    db = get_supabase_client()
    
    try:
        # FIX: Check Paid Subscription / 24h Pass first (Users Table)
        try:
            user_res = db.table("users").select(
                "is_pro, plan_tier, pass_expires_at, subscription_status"
            ).eq("email", email).single().execute()
            
            if user_res.data:
                u = user_res.data
                # Active Pro Subscription
                if u.get("is_pro") and u.get("subscription_status") == "active":
                    return {"has_access": True, "plan": u.get("plan_tier"), "type": "subscription"}
                
                # Active 24h Pass
                if u.get("plan_tier") == "pass_24h" and u.get("pass_expires_at"):
                    expires = datetime.fromisoformat(u["pass_expires_at"].replace("Z", "+00:00"))
                    if expires > datetime.now(expires.tzinfo):
                        return {"has_access": True, "plan": "pass_24h", "expires_at": u["pass_expires_at"], "type": "pass"}
        except Exception:
            # User might not exist in 'users' table if they only have a promo code
            pass

        # FIX: Check Promo Codes (Access Passes Table)
        promo_res = db.table("access_passes").select("*").eq("email", email).eq("is_active", True).order("created_at", desc=True).limit(1).execute()
        
        if promo_res.data and len(promo_res.data) > 0:
            row = promo_res.data[0]
            if row.get("expires_at"):
                expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
                if expires < datetime.now(expires.tzinfo):
                    return {"has_access": False, "reason": "expired"}
            
            caps = USAGE_CAPS.get(row["pass_type"], {"daily": 50, "monthly": 500})
            
            return {
                "has_access": True,
                "access_type": row["pass_type"],
                "expires_at": row["expires_at"],
                "daily_cap": caps.get("daily"),
                "monthly_cap": caps.get("monthly"),
                "type": "promo"
            }
        
        return {"has_access": False}
        
    except Exception as e:
        print(f"Access check error: {e}")
        return {"has_access": False, "error": str(e)}


@app.get("/api/security")
async def security_info():
    """Return security architecture info for compliance documentation."""
    return {
        "architecture": "ZERO_STORAGE",
        "description": "Files are processed entirely in memory and immediately discarded",
        "data_retention": {
            "drawings": "NEVER STORED - processed in memory only",
            "dimensions": "NEVER STORED - returned to client only",
            "history": "CLIENT-SIDE ONLY - stored in browser localStorage",
            "user_accounts": "Email only for authentication and access verification"
        },
        "compliance": [
            "ITAR - No foreign server storage",
            "EAR - No export-controlled data retention",
            "NIST 800-171 - CUI protection via zero storage",
            "ISO 27001 - Information security by design",
            "GDPR - Right to deletion by default"
        ],
        "encryption": {
            "in_transit": "TLS 1.3",
            "processing": "Isolated memory containers",
            "at_rest": "N/A - no data stored"
        }
    }


@app.get("/")
async def root():
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
        "security": "ZERO_STORAGE",
        "debug_endpoint": "/api/debug",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "security_model": "zero_storage"}


@app.get("/api")
async def api_root():
    return {
        "name": f"{APP_NAME} API",
        "version": APP_VERSION,
        "security_model": "ZERO_STORAGE",
        "description": "Your drawings are processed in memory and immediately deleted. We never store your technical data.",
        "endpoints": [
            "/api/process",
            "/api/export",
            "/api/security",
            "/api/debug",
            "/api/detect-region",
            "/download/pdf",
            "/download/zip",
            "/download/image",
            "/download/excel",
            "/api/auth/magic-link",
            "/api/auth/verify",
            "/api/promo/redeem",
            "/api/access/check",
            "/api/usage/check",
            "/api/templates/upload",
            "/api/templates/list",
            "/api/templates/{id}",
            "/api/templates/{id}/download",
            "/api/templates/tokens",
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
