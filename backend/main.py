"""
AutoBalloon Backend
FastAPI application for manufacturing blueprint dimension detection
Updated with:
- Multi-page PDF support
- Download routes for ballooned PDF/ZIP/Images
- Glass Wall system (guest sessions, payments v2)
- Promo code redemption
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from config import CORS_ORIGINS, APP_NAME, APP_VERSION
from datetime import datetime, timedelta
import httpx
import os

app = FastAPI(
    title=f"{APP_NAME} API",
    description="Automatic dimension ballooning for manufacturing blueprints",
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for now
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from api.routes import router as main_router
from api.auth_routes import router as auth_router
from api.payment_routes import router as payment_router
from api.usage_routes import router as usage_router
from api.history_routes import router as history_router
from api.download_routes import router as download_router

# Glass Wall routes
from api.guest_session_routes import router as guest_session_router
from api.payment_routes_v2 import router as payment_router_v2

# Include existing routers
app.include_router(main_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(payment_router, prefix="/api")
app.include_router(usage_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(download_router)

# Include Glass Wall routers
app.include_router(guest_session_router, prefix="/api")
app.include_router(payment_router_v2, prefix="/api")


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
# PROMO ROUTES
# =============================================================================

@app.post("/api/promo/redeem")
async def redeem_promo(request: Request):
    """
    Frontend sends: {"email": "user@example.com", "promo_code": "LINKEDIN24"}
    Backend grants 24h access and returns success
    """
    try:
        from database_service import get_db
        db = get_db()
        
        data = await request.json()
        email = data.get("email", "").lower().strip()
        code = data.get("promo_code", "").upper().strip()
        
        print(f"Promo redeem attempt: email={email}, code={code}")
        
        # Validate
        if not email or "@" not in email:
            return JSONResponse({"success": False, "message": "Invalid email"}, status_code=400)
        
        if code not in VALID_PROMO_CODES:
            return JSONResponse({"success": False, "message": "Invalid promo code"}, status_code=400)
        
        promo = VALID_PROMO_CODES[code]
        expires_at = (datetime.utcnow() + timedelta(hours=promo["hours"])).isoformat()
        
        # Check if already redeemed using Supabase client
        existing = db.table("access_passes").select("id").eq("email", email).eq("pass_type", promo["type"]).execute()
        
        if existing.data and len(existing.data) > 0:
            return JSONResponse({
                "success": False, 
                "message": "You've already used this promo code"
            }, status_code=400)
        
        # Grant access using Supabase client
        result = db.table("access_passes").insert({
            "email": email,
            "pass_type": promo["type"],
            "granted_by": f"promo_{code}",
            "expires_at": expires_at,
            "is_active": True
        }).execute()
        
        print(f"Promo redeemed successfully for {email}: {result}")
        
        return {
            "success": True,
            "message": f"Success! You have {promo['hours']} hours of free access.",
            "expires_at": expires_at,
            "hours": promo["hours"]
        }
        
    except Exception as e:
        print(f"Promo error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse({"success": False, "message": f"Server error: {str(e)}"}, status_code=500)


@app.get("/api/access/check")
async def check_access(email: str = ""):
    """
    Frontend calls: GET /api/access/check?email=user@example.com
    Returns: {"has_access": true/false, "expires_at": "...", ...}
    """
    if not email:
        return {"has_access": False}
    
    try:
        from database_service import get_db
        db = get_db()
        
        email = email.lower().strip()
        
        # Query using Supabase client
        result = db.table("access_passes").select("pass_type, expires_at, granted_by").eq("email", email).eq("is_active", True).order("created_at", desc=True).limit(1).execute()
        
        if result.data and len(result.data) > 0:
            row = result.data[0]
            # Check if not expired
            if row.get("expires_at"):
                expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
                if expires < datetime.now(expires.tzinfo):
                    return {"has_access": False, "reason": "expired"}
            
            return {
                "has_access": True,
                "access_type": row["pass_type"],
                "expires_at": row["expires_at"],
            }
        
        return {"has_access": False}
        
    except Exception as e:
        print(f"Access check error: {type(e).__name__}: {e}")
        return {"has_access": False, "error": str(e)}


# =============================================================================
# STANDARD ROUTES
# =============================================================================

@app.get("/")
async def root():
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api")
async def api_root():
    return {
        "name": f"{APP_NAME} API",
        "version": APP_VERSION,
        "endpoints": [
            # Processing
            "/api/process",
            "/api/export",
            # Downloads
            "/download/pdf",
            "/download/zip", 
            "/download/image",
            "/download/excel",
            # Auth
            "/api/auth/magic-link",
            "/api/auth/verify",
            # Promo (NEW)
            "/api/promo/redeem",
            "/api/access/check",
            # Payments (original)
            "/api/payments/pricing",
            # Payments v2 (Glass Wall)
            "/api/payments/create-checkout",
            "/api/payments/webhook",
            "/api/payments/check-access",
            # Guest Sessions (Glass Wall)
            "/api/guest-session/save",
            "/api/guest-session/capture-email",
            "/api/guest-session/retrieve/{session_id}",
            # Usage
            "/api/usage/check",
            # History
            "/api/history"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
