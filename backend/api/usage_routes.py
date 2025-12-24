"""
Usage Tracking Routes
Handles free tier usage limits using Supabase
"""
from fastapi import APIRouter, Header, Query, HTTPException
from typing import Optional
from datetime import datetime, timedelta
import os

router = APIRouter(prefix="/api/usage", tags=["usage"])

# Supabase setup
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

FREE_TIER_LIMIT = 3

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def get_month_start():
    """Get the first day of current month"""
    now = datetime.now()
    return datetime(now.year, now.month, 1).isoformat()


@router.get("/check")
async def check_usage(
    visitor_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    """Check current usage for visitor or authenticated user"""
    
    supabase = get_supabase()
    is_pro = False
    user_id = None
    identifier = visitor_id or "anonymous"
    
    # Check if authenticated user
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        # TODO: Verify JWT and get user_id
        # For now, use token prefix as identifier
        identifier = f"user_{token[:16]}"
    
    count = 0
    
    if supabase:
        try:
            # Get usage count for this month
            month_start = get_month_start()
            
            result = supabase.table("usage").select("*").eq(
                "visitor_id", identifier
            ).gte("created_at", month_start).execute()
            
            count = len(result.data) if result.data else 0
            
        except Exception as e:
            print(f"Supabase error: {e}")
            count = 0
    
    limit = 999999 if is_pro else FREE_TIER_LIMIT
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
    
    supabase = get_supabase()
    is_pro = False
    identifier = visitor_id or "anonymous"
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        identifier = f"user_{token[:16]}"
    
    count = 0
    
    if supabase:
        try:
            # Insert new usage record
            supabase.table("usage").insert({
                "visitor_id": identifier,
                "action": "process",
                "created_at": datetime.now().isoformat()
            }).execute()
            
            # Get updated count for this month
            month_start = get_month_start()
            result = supabase.table("usage").select("*").eq(
                "visitor_id", identifier
            ).gte("created_at", month_start).execute()
            
            count = len(result.data) if result.data else 1
            
        except Exception as e:
            print(f"Supabase error: {e}")
            count = 1
    
    limit = 999999 if is_pro else FREE_TIER_LIMIT
    remaining = max(0, limit - count)
    
    return {
        "count": count,
        "limit": limit,
        "remaining": remaining,
        "can_process": remaining > 0 or is_pro,
        "is_pro": is_pro
    }
