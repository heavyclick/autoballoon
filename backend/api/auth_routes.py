"""
Authentication API Routes
Magic link login, session management, and post-payment auto-login.
"""
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

from services.auth_service import auth_service, User
from services.database_service import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])

class MagicLinkRequest(BaseModel):
    email: EmailStr

class MagicLinkResponse(BaseModel):
    success: bool
    message: str
    current_plan: Optional[str] = None

class VerifyTokenRequest(BaseModel):
    token: str

class AuthResponse(BaseModel):
    success: bool
    user: Optional[dict] = None
    access_token: Optional[str] = None
    message: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    is_pro: bool
    history_enabled: bool

class SessionExchangeRequest(BaseModel):
    session_id: str

async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[User]:
    if not authorization: return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer": return None
    return auth_service.get_current_user(parts[1])

async def require_auth(authorization: Optional[str] = Header(None)) -> User:
    user = await get_current_user(authorization)
    if not user: raise HTTPException(status_code=401, detail="Not authenticated")
    return user

async def require_pro(user: User = Depends(require_auth)) -> User:
    if not user.is_pro: raise HTTPException(status_code=403, detail="Pro subscription required")
    return user

@router.post("/magic-link", response_model=MagicLinkResponse)
async def request_magic_link(request: MagicLinkRequest):
    """
    Send a magic login link to the user's email.
    Checks if user exists and is Pro (or has valid pass). If not, raises 402.
    """
    db = get_db()
    
    # FIX: Use limit(1) instead of single() to avoid exception if user doesn't exist
    result = db.table("users").select("*").eq("email", request.email.lower()).limit(1).execute()
    
    is_valid_user = False
    current_plan = None
    
    if result.data and len(result.data) > 0:
        user_data = result.data[0]
        # Check active subscription
        if user_data.get("is_pro") and user_data.get("subscription_status") == "active":
            is_valid_user = True
            current_plan = user_data.get("plan_tier")
        
        # Check 24-hour pass
        elif user_data.get("plan_tier") == "pass_24h" and user_data.get("pass_expires_at"):
            try:
                expires_at = datetime.fromisoformat(user_data["pass_expires_at"].replace("Z", "+00:00"))
                if expires_at > datetime.now(expires_at.tzinfo):
                    is_valid_user = True
                    current_plan = "pass_24h"
            except:
                pass
    
    # Block if no valid active plan found
    if not is_valid_user:
        raise HTTPException(
            status_code=402,
            detail="Active subscription required to login."
        )

    # Send Link
    token = auth_service.create_magic_link(request.email)
    
    if token:
        return MagicLinkResponse(
            success=True,
            message="Login link sent to your email. Check your inbox.",
            current_plan=current_plan
        )
    else:
        raise HTTPException(status_code=500, detail="Failed to send login link.")

@router.post("/verify", response_model=AuthResponse)
async def verify_magic_link(request: VerifyTokenRequest):
    result = auth_service.verify_magic_link(request.token)
    if result:
        return AuthResponse(success=True, user=result["user"], access_token=result["access_token"])
    else:
        return AuthResponse(success=False, message="Invalid link")

@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(require_auth)):
    return UserResponse(id=user.id, email=user.email, is_pro=user.is_pro, history_enabled=user.history_enabled)

@router.post("/logout")
async def logout():
    return {"success": True, "message": "Logged out successfully"}

@router.post("/exchange-session")
async def exchange_session(request: SessionExchangeRequest):
    db = get_db()
    session = db.table("guest_sessions").select("*").eq("session_id", request.session_id).single().execute()
    if not session.data: raise HTTPException(status_code=404, detail="Session not found")
    data = session.data
    user = None
    if data.get("claimed_by"):
        user_id = data.get("claimed_by")
        user = auth_service.get_user_by_id(user_id)
    elif data.get("email"):
        user = auth_service.get_user_by_email(data.get("email"))
        if not user or not user.is_pro: raise HTTPException(status_code=403, detail="Session not yet confirmed paid")
    else:
        raise HTTPException(status_code=403, detail="Session not claimed")
    if not user: raise HTTPException(status_code=404, detail="User not found")
    token = auth_service.create_access_token(user)
    return {"user": user.model_dump(), "access_token": token}
