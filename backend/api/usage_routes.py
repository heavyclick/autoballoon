"""
Usage Tracking Routes
Handles free tier usage limits
"""
from fastapi import APIRouter, Header, Query
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/usage", tags=["usage"])

# In-memory storage for demo (replace with Supabase in production)
usage_store = {}

class UsageResponse(BaseModel):
    used: int
    limit: int
    remaining: int
    is_pro: bool
    reset_date: str

class IncrementResponse(BaseModel):
    success: bool
    used: int
    remaining: int


def get_month_key():
    """Get current month key for usage tracking"""
    return datetime.now().strftime("%Y-%m")


@router.get("/check", response_model=UsageResponse)
async def check_usage(
    visitor_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Check current usage for visitor or authenticated user"""
    
    # Determine user identifier
    user_key = None
    is_pro = False
    
    if authorization and authorization.startswith("Bearer "):
        # Authenticated user - would check JWT and database
        # For now, treat as pro user if authenticated
        token = authorization.split(" ")[1]
        user_key = f"user_{token[:16]}"
        # In production: verify JWT, check if user is_pro in database
        is_pro = False  # Would come from database
    elif visitor_id:
        user_key = visitor_id
    else:
        user_key = "anonymous"
    
    month_key = get_month_key()
    storage_key = f"{user_key}_{month_key}"
    
    # Get current usage
    used = usage_store.get(storage_key, 0)
    limit = 999999 if is_pro else 3
    remaining = max(0, limit - used)
    
    # Calculate reset date (first of next month)
    now = datetime.now()
    if now.month == 12:
        reset_date = f"{now.year + 1}-01-01"
    else:
        reset_date = f"{now.year}-{now.month + 1:02d}-01"
    
    return UsageResponse(
        used=used,
        limit=limit,
        remaining=remaining,
        is_pro=is_pro,
        reset_date=reset_date
    )


@router.post("/increment", response_model=IncrementResponse)
async def increment_usage(
    visitor_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Increment usage count after successful processing"""
    
    # Determine user identifier
    user_key = None
    is_pro = False
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        user_key = f"user_{token[:16]}"
    elif visitor_id:
        user_key = visitor_id
    else:
        user_key = "anonymous"
    
    month_key = get_month_key()
    storage_key = f"{user_key}_{month_key}"
    
    # Increment usage
    current = usage_store.get(storage_key, 0)
    usage_store[storage_key] = current + 1
    
    limit = 999999 if is_pro else 3
    remaining = max(0, limit - usage_store[storage_key])
    
    return IncrementResponse(
        success=True,
        used=usage_store[storage_key],
        remaining=remaining
    )
