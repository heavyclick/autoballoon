"""
API Routes Package
"""
from .routes import router as main_router
from .auth_routes import router as auth_router
from .payment_routes import router as payment_router
from .usage_routes import router as usage_router
from .history_routes import router as history_router
from .download_routes import router as download_router  # NEW

__all__ = [
    "main_router",
    "auth_router", 
    "payment_router",
    "usage_router",
    "history_router",
    "download_router",  # NEW
]
