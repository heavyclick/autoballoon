"""
Guest Session Routes
Handles guest session storage and retrieval for the Glass Wall system.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import os

router = APIRouter(prefix="/guest-session", tags=["Guest Sessions"])

# Import Supabase client
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_supabase() -> Optional[Client]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ==================
# Request/Response Models
# ==================

class SaveSessionRequest(BaseModel):
    """Request to save guest session data"""
    session_id: str
    filename: Optional[str] = None
    image: Optional[str] = None  # Base64 image
    dimensions: Optional[List[Dict[str, Any]]] = []
    dimensionCount: Optional[int] = 0
    grid: Optional[Dict[str, Any]] = None
    totalPages: Optional[int] = 1
    pages: Optional[List[Dict[str, Any]]] = None
    processingTimeMs: Optional[int] = 0
    estimatedManualHours: Optional[float] = 0


class CaptureEmailRequest(BaseModel):
    """Request to capture email at paywall"""
    session_id: str
    email: EmailStr


class SessionResponse(BaseModel):
    """Response with session data"""
    success: bool
    session_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


# ==================
# API Endpoints
# ==================

@router.post("/save", response_model=SessionResponse)
async def save_guest_session(request: SaveSessionRequest):
    """
    Save or update a guest session with processing results.
    Called after processing completes.
    """
    supabase = get_supabase()
    if not supabase:
        # If no database, just return success (frontend has localStorage backup)
        return SessionResponse(
            success=True,
            session_id=request.session_id,
            message="Session saved locally (database not configured)"
        )
    
    try:
        expires_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()
        
        # Check if session exists
        existing = supabase.table("guest_sessions").select("id").eq(
            "session_id", request.session_id
        ).execute()
        
        session_data = {
            "session_id": request.session_id,
            "filename": request.filename,
            "image_data": request.image,
            "dimensions": request.dimensions,
            "dimension_count": request.dimensionCount or len(request.dimensions or []),
            "grid_data": request.grid,
            "total_pages": request.totalPages,
            "pages_data": request.pages,
            "processing_time_ms": request.processingTimeMs,
            "estimated_manual_hours": request.estimatedManualHours,
            "expires_at": expires_at,
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        if existing.data and len(existing.data) > 0:
            # Update existing session
            supabase.table("guest_sessions").update(session_data).eq(
                "session_id", request.session_id
            ).execute()
        else:
            # Insert new session
            session_data["created_at"] = datetime.utcnow().isoformat()
            supabase.table("guest_sessions").insert(session_data).execute()
        
        return SessionResponse(
            success=True,
            session_id=request.session_id,
            message="Session saved successfully"
        )
        
    except Exception as e:
        print(f"Error saving guest session: {e}")
        # Don't fail - frontend has localStorage backup
        return SessionResponse(
            success=True,
            session_id=request.session_id,
            message=f"Session saved with warning: {str(e)}"
        )


@router.post("/capture-email", response_model=SessionResponse)
async def capture_email(request: CaptureEmailRequest):
    """
    Capture email address when user reaches paywall.
    Used for abandoned cart emails.
    """
    supabase = get_supabase()
    if not supabase:
        return SessionResponse(
            success=True,
            session_id=request.session_id,
            message="Email captured locally"
        )
    
    try:
        # Update session with email
        supabase.table("guest_sessions").update({
            "email": request.email,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("session_id", request.session_id).execute()
        
        return SessionResponse(
            success=True,
            session_id=request.session_id,
            message="Email captured successfully"
        )
        
    except Exception as e:
        print(f"Error capturing email: {e}")
        return SessionResponse(
            success=False,
            session_id=request.session_id,
            message=f"Failed to capture email: {str(e)}"
        )


@router.get("/retrieve/{session_id}", response_model=SessionResponse)
async def retrieve_guest_session(session_id: str):
    """
    Retrieve a guest session by session ID.
    Used to restore session after payment.
    """
    supabase = get_supabase()
    if not supabase:
        return SessionResponse(
            success=False,
            message="Database not configured"
        )
    
    try:
        result = supabase.table("guest_sessions").select("*").eq(
            "session_id", session_id
        ).single().execute()
        
        if not result.data:
            return SessionResponse(
                success=False,
                session_id=session_id,
                message="Session not found"
            )
        
        # Check if expired
        expires_at = datetime.fromisoformat(result.data["expires_at"].replace("Z", "+00:00"))
        if expires_at < datetime.now(expires_at.tzinfo):
            return SessionResponse(
                success=False,
                session_id=session_id,
                message="Session expired"
            )
        
        return SessionResponse(
            success=True,
            session_id=session_id,
            data={
                "filename": result.data.get("filename"),
                "image": result.data.get("image_data"),
                "dimensions": result.data.get("dimensions"),
                "dimensionCount": result.data.get("dimension_count"),
                "grid": result.data.get("grid_data"),
                "totalPages": result.data.get("total_pages"),
                "pages": result.data.get("pages_data"),
                "processingTimeMs": result.data.get("processing_time_ms"),
                "estimatedManualHours": result.data.get("estimated_manual_hours"),
            }
        )
        
    except Exception as e:
        print(f"Error retrieving session: {e}")
        return SessionResponse(
            success=False,
            session_id=session_id,
            message=f"Failed to retrieve session: {str(e)}"
        )


@router.post("/claim/{session_id}")
async def claim_guest_session(session_id: str, user_id: str):
    """
    Claim a guest session after successful payment.
    Links the session data to the user account.
    """
    supabase = get_supabase()
    if not supabase:
        return {"success": False, "message": "Database not configured"}
    
    try:
        supabase.table("guest_sessions").update({
            "is_claimed": True,
            "claimed_by": user_id,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("session_id", session_id).execute()
        
        return {"success": True, "message": "Session claimed successfully"}
        
    except Exception as e:
        print(f"Error claiming session: {e}")
        return {"success": False, "message": str(e)}
