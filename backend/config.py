"""
AutoBalloon Configuration
Environment variables and application constants
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# ======================
# API Keys - External Services
# ======================
GOOGLE_CLOUD_API_KEY = os.getenv("GOOGLE_CLOUD_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ======================
# Supabase Configuration
# ======================
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# ======================
# Paystack Configuration
# ======================
PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY", "")
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
PAYSTACK_WEBHOOK_SECRET = os.getenv("PAYSTACK_WEBHOOK_SECRET", "")
PAYSTACK_PLAN_CODE = os.getenv("PAYSTACK_PLAN_CODE", "")

# ======================
# Resend (Email) Configuration
# ======================
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "AutoBalloon <noreply@autoballoon.space>")

# ======================
# Application Configuration
# ======================
APP_URL = os.getenv("APP_URL", "https://autoballoon.space")
APP_NAME = "AutoBalloon"
APP_VERSION = "1.0.0"

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Magic Link Configuration
MAGIC_LINK_EXPIRATION_MINUTES = 15

# ======================
# Usage Limits
# ======================
FREE_TIER_LIMIT = 3  # Free drawings per month

# ======================
# Dodo Payments Configuration
# ======================
DODO_PAYMENTS_API_KEY = os.getenv("DODO_PAYMENTS_API_KEY", "")
DODO_PAYMENTS_WEBHOOK_SECRET = os.getenv("DODO_PAYMENTS_WEBHOOK_SECRET", "")
DODO_PAYMENTS_ENVIRONMENT = os.getenv("DODO_PAYMENTS_ENVIRONMENT", "test_mode")  # test_mode or live_mode

# Dodo Payments Product IDs
DODO_LITE_MONTHLY_PRODUCT_ID = os.getenv("DODO_LITE_MONTHLY_PRODUCT_ID", "")
DODO_LITE_ANNUAL_PRODUCT_ID = os.getenv("DODO_LITE_ANNUAL_PRODUCT_ID", "")
DODO_PRO_MONTHLY_PRODUCT_ID = os.getenv("DODO_PRO_MONTHLY_PRODUCT_ID", "")
DODO_PRO_ANNUAL_PRODUCT_ID = os.getenv("DODO_PRO_ANNUAL_PRODUCT_ID", "")

# ======================
# Pricing Plans
# ======================
PRICING_PLANS = {
    "lite_monthly": {
        "name": "Lite Plan",
        "price": 20,
        "original_price": 39,
        "billing": "monthly",
        "daily_limit": 10,
        "monthly_limit": 100,
        "display_as_unlimited": False,
        "dodo_product_id": DODO_LITE_MONTHLY_PRODUCT_ID,
    },
    "lite_annual": {
        "name": "Lite Plan",
        "price": 200,  # $20 x 10 months (2 months free)
        "original_price": 390,
        "billing": "annual",
        "daily_limit": 10,
        "monthly_limit": 100,
        "display_as_unlimited": False,
        "dodo_product_id": DODO_LITE_ANNUAL_PRODUCT_ID,
    },
    "pro_monthly": {
        "name": "Pro Plan",
        "price": 99,
        "original_price": 199,
        "billing": "monthly",
        "daily_limit": 75,
        "monthly_limit": 500,
        "display_as_unlimited": True,
        "dodo_product_id": DODO_PRO_MONTHLY_PRODUCT_ID,
    },
    "pro_annual": {
        "name": "Pro Plan",
        "price": 990,  # $99 x 10 months (2 months free)
        "original_price": 1990,
        "billing": "annual",
        "daily_limit": 75,
        "monthly_limit": 500,
        "display_as_unlimited": True,
        "dodo_product_id": DODO_PRO_ANNUAL_PRODUCT_ID,
    }
}

# Legacy pricing (for backward compatibility)
PRICE_MONTHLY_USD = 99
PRICE_MONTHLY_NGN = 99 * 1600
GRANDFATHER_PRICE_USD = 99
FUTURE_PRICE_USD = 199

# ======================
# File Processing
# ======================
MAX_FILE_SIZE_MB = 25
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif"}
TARGET_DPI = 400

# ======================
# Image Processing
# ======================
NORMALIZED_COORD_SYSTEM = 1000

# ======================
# Confidence Thresholds
# ======================
HIGH_CONFIDENCE_THRESHOLD = 0.85
MEDIUM_CONFIDENCE_THRESHOLD = 0.70

# ======================
# Paths
# ======================
BASE_DIR = Path(__file__).parent
TEMP_DIR = BASE_DIR / "temp"

# ======================
# Export
# ======================
AS9102_COLUMNS = [
    "Char No",
    "Reference Location", 
    "Characteristic Designator",
    "Requirement",
    "Results",
    "Tool Used",
    "Non-Conformance"
]

# ======================
# CORS Configuration
# ======================
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://autoballoon.space",
    "https://www.autoballoon.space",
]

# ======================
# Helper Functions
# ======================
def is_production():
    return os.getenv("ENVIRONMENT", "development") == "production"

def get_frontend_url():
    if is_production():
        return "https://autoballoon.space"
    return "http://localhost:3000"
