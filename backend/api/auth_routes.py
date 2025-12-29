"""
Authentication API Routes
Magic link login, session management, and post-payment auto-login.
"""
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, EmailStr
from typing import Optional

from services.auth_service import auth_service, User
from services.database_service import get_db


router = APIRouter(prefix="/auth", tags=["Authentication"])


# ==================
# Request/Response Models
# ==================

class MagicLinkRequest(BaseModel):
    """Request to send magic link"""
    email: EmailStr


class MagicLinkResponse(BaseModel):
    """Response after sending magic link"""
    success: bool
    message: str
    current_plan: Optional[str] = None # Added field to return plan type to frontend


class VerifyTokenRequest(BaseModel):
    """Request to verify magic link token"""
    token: str


class AuthResponse(BaseModel):
    """Response with user and access token"""
    success: bool
    user: Optional[dict] = None
    access_token: Optional[str] = None
    message: Optional[str] = None


class UserResponse(BaseModel):
    """Current user response"""
    id: str
    email: str
    is_pro: bool
    history_enabled: bool

class SessionExchangeRequest(BaseModel):
    session_id: str


# ==================
# Dependencies
# ==================

async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[User]:
    if not authorization: return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer": return None
    token = parts[1]
    return auth_service.get_current_user(token)


async def require_auth(authorization: Optional[str] = Header(None)) -> User:
    user = await get_current_user(authorization)
    if not user: raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_pro(user: User = Depends(require_auth)) -> User:
    if not user.is_pro: raise HTTPException(status_code=403, detail="Pro subscription required")
    return user


# ==================
# Endpoints
# ==================

@router.post("/magic-link", response_model=MagicLinkResponse)
async def request_magic_link(request: MagicLinkRequest):
    """
    Send a magic login link to the user's email.
    Checks if user exists and is Pro. If not, raises 402.
    """
    # 1. Check if user exists and is allowed to login
    user = auth_service.get_user_by_email(request.email)
    
    # If user does not exist OR user exists but is not Pro -> BLOCK
    if not user or not user.is_pro:
        raise HTTPException(
            status_code=402,  # Payment Required
            detail="Active subscription required to login."
        )

    # 2. Only proceed if authorized
    token = auth_service.create_magic_link(request.email)
    
    if token:
        # Optional: Fetch current plan to return to frontend
        current_plan = "monthly" # Default fallback
        # Implement logic here to query DB for actual plan if needed
        
        return MagicLinkResponse(
            success=True,
            message="Login link sent to your email. Check your inbox.",
            current_plan=current_plan
        )
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to send login link. Please try again."
        )


@router.post("/verify", response_model=AuthResponse)
async def verify_magic_link(request: VerifyTokenRequest):
    result = auth_service.verify_magic_link(request.token)
    if result:
        return AuthResponse(
            success=True,
            user=result["user"],
            access_token=result["access_token"]
        )
    else:
        return AuthResponse(
            success=False,
            message="Invalid or expired login link. Please request a new one."
        )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(require_auth)):
    return UserResponse(
        id=user.id,
        email=user.email,
        is_pro=user.is_pro,
        history_enabled=user.history_enabled
    )


@router.post("/logout")
async def logout():
    return {"success": True, "message": "Logged out successfully"}


@router.post("/exchange-session")
async def exchange_session(request: SessionExchangeRequest):
    db = get_db()
    session = db.table("guest_sessions").select("*").eq("session_id", request.session_id).single().execute()
    
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
        
    data = session.data
    user = None
    
    if data.get("claimed_by"):
        user_id = data.get("claimed_by")
        user = auth_service.get_user_by_id(user_id)
    elif data.get("email"):
        user = auth_service.get_user_by_email(data.get("email"))
        if not user or not user.is_pro:
             raise HTTPException(status_code=403, detail="Session not yet confirmed paid")
    else:
        raise HTTPException(status_code=403, detail="Session not claimed")
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    token = auth_service.create_access_token(user)
    
    return {
        "user": user.model_dump(),
        "access_token": token
    }
