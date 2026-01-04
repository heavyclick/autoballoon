"""
Usage Tracking Service
Handles daily and monthly upload limits for Lite and Pro plans
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Tuple
import os

from supabase import create_client, Client

from config import PRICING_PLANS


class UsageTrackingService:
    """
    Tracks upload usage for subscription plans.

    Lite Plan: 10/day, 100/month - Show "99/100 uploads remaining this month"
    Pro Plan: 75/day, 500/month (displayed as "Unlimited") - Show warning at >70% daily
    """

    def __init__(self):
        self.db = None

    def _get_db(self) -> Optional[Client]:
        """Lazy load Supabase client"""
        if self.db is None:
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_KEY")
            if url and key:
                self.db = create_client(url, key)
        return self.db

    def _get_plan_limits(self, plan_tier: str) -> Tuple[int, int, bool]:
        """
        Get limits for a plan tier.

        Returns:
            Tuple of (daily_limit, monthly_limit, display_as_unlimited)
        """
        plan = PRICING_PLANS.get(plan_tier, {})
        return (
            plan.get("daily_limit", 0),
            plan.get("monthly_limit", 0),
            plan.get("display_as_unlimited", False)
        )

    def _should_reset_daily(self, reset_at: datetime) -> bool:
        """Check if daily counter should be reset"""
        if reset_at is None:
            return True
        # Reset if more than 24 hours have passed
        now = datetime.utcnow()
        if isinstance(reset_at, str):
            reset_at = datetime.fromisoformat(reset_at.replace("Z", "+00:00")).replace(tzinfo=None)
        return (now - reset_at) > timedelta(hours=24)

    def _should_reset_monthly(self, reset_at: datetime) -> bool:
        """Check if monthly counter should be reset"""
        if reset_at is None:
            return True
        now = datetime.utcnow()
        if isinstance(reset_at, str):
            reset_at = datetime.fromisoformat(reset_at.replace("Z", "+00:00")).replace(tzinfo=None)
        # Reset if we're in a different month
        return now.strftime("%Y-%m") != reset_at.strftime("%Y-%m")

    def check_usage_limit(self, email: str) -> Dict[str, Any]:
        """
        Check if user can upload based on their plan limits.

        Args:
            email: User's email address

        Returns:
            Dict with can_upload, daily/monthly counts, limits, and any warnings
        """
        db = self._get_db()
        if not db:
            return {
                "can_upload": False,
                "error": "Database not configured"
            }

        try:
            result = db.table("users").select(
                "daily_uploads_count, monthly_uploads_count, "
                "daily_uploads_reset_at, monthly_uploads_reset_at, "
                "plan_tier, daily_limit, monthly_limit, is_pro"
            ).eq("email", email.lower()).single().execute()

            if not result.data:
                return {
                    "can_upload": False,
                    "error": "User not found",
                    "is_subscribed": False
                }

            user = result.data
            plan_tier = user.get("plan_tier", "free")

            # Free users have no subscription
            if plan_tier == "free" or not user.get("is_pro"):
                return {
                    "can_upload": False,
                    "error": "No active subscription",
                    "is_subscribed": False,
                    "plan_tier": "free"
                }

            daily_count = user.get("daily_uploads_count", 0) or 0
            monthly_count = user.get("monthly_uploads_count", 0) or 0
            daily_limit = user.get("daily_limit", 0) or 0
            monthly_limit = user.get("monthly_limit", 0) or 0

            # Check if resets are needed
            needs_daily_reset = self._should_reset_daily(user.get("daily_uploads_reset_at"))
            needs_monthly_reset = self._should_reset_monthly(user.get("monthly_uploads_reset_at"))

            # Apply resets
            if needs_daily_reset:
                daily_count = 0
            if needs_monthly_reset:
                monthly_count = 0

            # Calculate remaining
            daily_remaining = max(0, daily_limit - daily_count) if daily_limit > 0 else 999999
            monthly_remaining = max(0, monthly_limit - monthly_count) if monthly_limit > 0 else 999999

            # Check if can upload
            can_upload = True
            limit_error = None

            if daily_limit > 0 and daily_count >= daily_limit:
                can_upload = False
                limit_error = "daily_limit_reached"
            elif monthly_limit > 0 and monthly_count >= monthly_limit:
                can_upload = False
                limit_error = "monthly_limit_reached"

            # Get display settings
            _, _, display_as_unlimited = self._get_plan_limits(plan_tier)

            # Calculate warning for Pro users (>70% daily usage)
            daily_usage_percent = (daily_count / daily_limit * 100) if daily_limit > 0 else 0
            show_warning = display_as_unlimited and daily_usage_percent >= 70

            return {
                "can_upload": can_upload,
                "is_subscribed": True,
                "plan_tier": plan_tier,
                "daily_count": daily_count,
                "monthly_count": monthly_count,
                "daily_limit": daily_limit,
                "monthly_limit": monthly_limit,
                "daily_remaining": daily_remaining,
                "monthly_remaining": monthly_remaining,
                "display_as_unlimited": display_as_unlimited,
                "show_daily_warning": show_warning,
                "daily_usage_percent": round(daily_usage_percent, 1),
                "limit_error": limit_error,
                "needs_daily_reset": needs_daily_reset,
                "needs_monthly_reset": needs_monthly_reset
            }

        except Exception as e:
            print(f"Error checking usage limit: {e}")
            return {
                "can_upload": False,
                "error": str(e)
            }

    def increment_usage(self, email: str) -> Dict[str, Any]:
        """
        Increment daily and monthly counters for a user.
        Should be called after successful upload.

        Args:
            email: User's email address

        Returns:
            Updated usage stats
        """
        db = self._get_db()
        if not db:
            return {"success": False, "error": "Database not configured"}

        try:
            # First check current usage and apply resets if needed
            usage = self.check_usage_limit(email)

            if not usage.get("is_subscribed"):
                return {"success": False, "error": "No active subscription"}

            if not usage.get("can_upload"):
                return {"success": False, "error": usage.get("limit_error", "Limit reached")}

            # Build update payload
            update_data = {
                "daily_uploads_count": (usage.get("daily_count", 0) + 1) if not usage.get("needs_daily_reset") else 1,
                "monthly_uploads_count": (usage.get("monthly_count", 0) + 1) if not usage.get("needs_monthly_reset") else 1,
            }

            # Reset timestamps if needed
            if usage.get("needs_daily_reset"):
                update_data["daily_uploads_reset_at"] = datetime.utcnow().isoformat()
            if usage.get("needs_monthly_reset"):
                update_data["monthly_uploads_reset_at"] = datetime.utcnow().isoformat()

            # Update database
            db.table("users").update(update_data).eq("email", email.lower()).execute()

            # Return updated stats
            new_daily_count = update_data["daily_uploads_count"]
            new_monthly_count = update_data["monthly_uploads_count"]
            daily_limit = usage.get("daily_limit", 0)
            monthly_limit = usage.get("monthly_limit", 0)

            return {
                "success": True,
                "daily_count": new_daily_count,
                "monthly_count": new_monthly_count,
                "daily_remaining": max(0, daily_limit - new_daily_count) if daily_limit > 0 else 999999,
                "monthly_remaining": max(0, monthly_limit - new_monthly_count) if monthly_limit > 0 else 999999,
                "display_as_unlimited": usage.get("display_as_unlimited", False),
                "show_daily_warning": usage.get("display_as_unlimited") and (new_daily_count / daily_limit * 100 >= 70) if daily_limit > 0 else False,
                "daily_usage_percent": round(new_daily_count / daily_limit * 100, 1) if daily_limit > 0 else 0
            }

        except Exception as e:
            print(f"Error incrementing usage: {e}")
            return {"success": False, "error": str(e)}

    def get_usage_stats(self, email: str) -> Dict[str, Any]:
        """
        Get usage statistics for display in UI.

        For Lite users: "99/100 uploads remaining this month"
        For Pro users: "You've used 70% of your daily limit" (only if >70%)

        Args:
            email: User's email address

        Returns:
            Dict with usage stats formatted for UI display
        """
        usage = self.check_usage_limit(email)

        if not usage.get("is_subscribed"):
            return {
                "has_subscription": False,
                "display_text": None,
                "show_counter": False
            }

        plan_tier = usage.get("plan_tier", "free")
        display_as_unlimited = usage.get("display_as_unlimited", False)

        if display_as_unlimited:
            # Pro Plan - only show warning if >70% daily usage
            if usage.get("show_daily_warning"):
                return {
                    "has_subscription": True,
                    "plan_tier": plan_tier,
                    "display_text": f"You've used {usage.get('daily_usage_percent', 0)}% of your daily limit",
                    "show_counter": True,
                    "counter_type": "warning",
                    "daily_remaining": usage.get("daily_remaining"),
                    "monthly_remaining": usage.get("monthly_remaining")
                }
            else:
                return {
                    "has_subscription": True,
                    "plan_tier": plan_tier,
                    "display_text": None,  # Don't show anything for Pro under 70%
                    "show_counter": False,
                    "counter_type": None,
                    "daily_remaining": usage.get("daily_remaining"),
                    "monthly_remaining": usage.get("monthly_remaining")
                }
        else:
            # Lite Plan - always show monthly remaining
            monthly_remaining = usage.get("monthly_remaining", 0)
            monthly_limit = usage.get("monthly_limit", 100)

            return {
                "has_subscription": True,
                "plan_tier": plan_tier,
                "display_text": f"{monthly_remaining}/{monthly_limit} uploads remaining this month",
                "show_counter": True,
                "counter_type": "info",
                "daily_remaining": usage.get("daily_remaining"),
                "monthly_remaining": monthly_remaining,
                "monthly_limit": monthly_limit
            }

    def reset_daily_usage(self) -> Dict[str, Any]:
        """
        Reset daily counters for all users.
        Should be called by a cron job at midnight UTC.

        Returns:
            Dict with number of users reset
        """
        db = self._get_db()
        if not db:
            return {"success": False, "error": "Database not configured"}

        try:
            result = db.rpc("reset_daily_uploads").execute()
            return {
                "success": True,
                "users_reset": result.data if result.data else 0
            }
        except Exception as e:
            print(f"Error resetting daily usage: {e}")
            return {"success": False, "error": str(e)}

    def reset_monthly_usage(self) -> Dict[str, Any]:
        """
        Reset monthly counters for all users.
        Should be called by a cron job on the 1st of each month.

        Returns:
            Dict with number of users reset
        """
        db = self._get_db()
        if not db:
            return {"success": False, "error": "Database not configured"}

        try:
            result = db.rpc("reset_monthly_uploads").execute()
            return {
                "success": True,
                "users_reset": result.data if result.data else 0
            }
        except Exception as e:
            print(f"Error resetting monthly usage: {e}")
            return {"success": False, "error": str(e)}

    def set_user_plan_limits(self, email: str, plan_tier: str) -> bool:
        """
        Set the plan limits for a user after subscription.

        Args:
            email: User's email address
            plan_tier: Plan tier (lite_monthly, lite_annual, pro_monthly, pro_annual)

        Returns:
            True if successful
        """
        db = self._get_db()
        if not db:
            return False

        daily_limit, monthly_limit, _ = self._get_plan_limits(plan_tier)

        try:
            db.table("users").update({
                "plan_tier": plan_tier,
                "daily_limit": daily_limit,
                "monthly_limit": monthly_limit,
                "is_pro": True,
                "daily_uploads_count": 0,
                "monthly_uploads_count": 0,
                "daily_uploads_reset_at": datetime.utcnow().isoformat(),
                "monthly_uploads_reset_at": datetime.utcnow().isoformat()
            }).eq("email", email.lower()).execute()

            return True
        except Exception as e:
            print(f"Error setting user plan limits: {e}")
            return False


# Singleton instance
usage_tracking_service = UsageTrackingService()
