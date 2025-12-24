"""
Usage Tracking Routes
Handles free tier usage limits
"""
from fastapi import APIRouter, Header, Query
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/usage", tags=["usage"])

# In-memory storage (resets on server restart - use Supabase for persistence)
usage_store = {}

class UsageResponse(BaseModel):
    count: int
    limit: int
    remaining: int
    can_process: bool
    is_pro: bool

class IncrementResponse(BaseModel):
    count: int
    limit: int
    remaining: int
    can_process: bool
    is_pro: bool


def get_month_key():
    return datetime.now().strftime("%Y-%m")


@router.get("/check")
async def check_usage(
    visitor_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Check current usage for visitor or authenticated user"""
    
    is_pro = False
    user_key = visitor_id or "anonymous"
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        user_key = f"user_{token[:16]}"
    
    month_key = get_month_key()
    storage_key = f"{user_key}_{month_key}"
    
    count = usage_store.get(storage_key, 0)
    limit = 999999 if is_pro else 3
    remaining = max(0, limit - count)
    
    return {
        "count": count,
        "limit": limit,
        "remaining": remaining,
        "can_process": remaining > 0 or is_pro,
        "is_pro": is_pro
    }


@router.post("/increment")
async def increment_usage(
    visitor_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Increment usage count after successful processing"""
    
    is_pro = False
    user_key = visitor_id or "anonymous"
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        user_key = f"user_{token[:16]}"
    
    month_key = get_month_key()
    storage_key = f"{user_key}_{month_key}"
    
    # Increment
    current = usage_store.get(storage_key, 0)
    usage_store[storage_key] = current + 1
    
    count = usage_store[storage_key]
    limit = 999999 if is_pro else 3
    remaining = max(0, limit - count)
    
    return {
        "count": count,
        "limit": limit,
        "remaining": remaining,
        "can_process": remaining > 0 or is_pro,
        "is_pro": is_pro
    }
