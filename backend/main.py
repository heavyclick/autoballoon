"""
AutoBalloon Backend
FastAPI application for manufacturing blueprint dimension detection

Updated with:
- Multi-page PDF support
- Download routes for ballooned PDF/ZIP/Images
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS, APP_NAME, APP_VERSION

app = FastAPI(
    title=f"{APP_NAME} API",
    description="Automatic dimension ballooning for manufacturing blueprints",
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for now
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from api.routes import router as main_router
from api.auth_routes import router as auth_router
from api.payment_routes import router as payment_router
from api.usage_routes import router as usage_router
from api.history_routes import router as history_router
from api.download_routes import router as download_router  # NEW

app.include_router(main_router)
app.include_router(auth_router)
app.include_router(payment_router)
app.include_router(usage_router)
app.include_router(history_router)
app.include_router(download_router)  # NEW

@app.get("/")
async def root():
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api")
async def api_root():
    return {
        "name": f"{APP_NAME} API",
        "version": APP_VERSION,
        "endpoints": [
            # Processing
            "/api/process",
            "/api/export",
            # Downloads (NEW)
            "/download/pdf",
            "/download/zip", 
            "/download/image",
            "/download/excel",
            # Auth
            "/api/auth/magic-link",
            "/api/auth/verify",
            # Payments
            "/api/payments/pricing",
            # Usage
            "/api/usage/check",
            # History
            "/api/history"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
