"""
Usage Tracking Routes - Fixed for unique constraint
"""
from fastapi import APIRouter, Header, Query
from typing import Optional
from datetime import datetime
import os

router = APIRouter(prefix="/api/usage", tags=["usage"])

from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
FREE_TIER_LIMIT = 3

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_month_year():
    return datetime.now().strftime("%Y-%m")

@router.get("/check")
async def check_usage(
    visitor_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None)
):
    supabase = get_supabase()
    identifier = visitor_id or "anonymous"
    is_pro = False
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        identifier = f"user_{token[:16]}"
    
    count = 0
    month_year = get_month_year()
    
    if supabase:
        try:
            # Get the count from the usage record
            result = supabase.table("usage").select("count").eq(
                "visitor_id", identifier
            ).eq("month_year", month_year).execute()
            
            if result.data and len(result.data) > 0:
                count = result.data[0].get("count", 0) or 0
        except Exception as e:
            print(f"Supabase check error: {e}")
    
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
    supabase = get_supabase()
    identifier = visitor_id or "anonymous"
    is_pro = False
    
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        identifier = f"user_{token[:16]}"
    
    count = 1
    month_year = get_month_year()
    
    if supabase:
        try:
            # First, check if record exists
            existing = supabase.table("usage").select("id, count").eq(
                "visitor_id", identifier
            ).eq("month_year", month_year).execute()
            
            if existing.data and len(existing.data) > 0:
                # Update existing record
                current_count = existing.data[0].get("count", 0) or 0
                new_count = current_count + 1
                record_id = existing.data[0]["id"]
                
                supabase.table("usage").update({
                    "count": new_count,
                    "updated_at": datetime.now().isoformat()
                }).eq("id", record_id).execute()
                
                count = new_count
            else:
                # Insert new record
                supabase.table("usage").insert({
                    "visitor_id": identifier,
                    "month_year": month_year,
                    "count": 1,
                    "action": "process",
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }).execute()
                count = 1
                
        except Exception as e:
            print(f"Supabase increment error: {e}")
    
    limit = 999999 if is_pro else FREE_TIER_LIMIT
    remaining = max(0, limit - count)
    
    return {
        "count": count,
        "limit": limit,
        "remaining": remaining,
        "can_process": remaining > 0 or is_pro,
        "is_pro": is_pro
    }
