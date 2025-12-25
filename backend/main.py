"""
AutoBalloon Backend
FastAPI application for manufacturing blueprint dimension detection

Features:
- Multi-page PDF support
- Download routes for ballooned PDF/ZIP/Images
- AS9102 Rev C compliant exports
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AutoBalloon API",
    description="Automatic dimension ballooning for manufacturing blueprints",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration - allow all origins for now
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
from api.download_routes import router as download_router

app.include_router(main_router, prefix="/api")
app.include_router(auth_router)
app.include_router(payment_router)
app.include_router(usage_router)
app.include_router(history_router)
app.include_router(download_router)


@app.get("/")
async def root():
    return {
        "name": "AutoBalloon",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api")
async def api_root():
    return {
        "name": "AutoBalloon API",
        "version": "1.0.0",
        "endpoints": [
            "/api/process",
            "/api/export",
            "/download/pdf",
            "/download/zip", 
            "/download/image",
            "/download/excel",
            "/api/auth/magic-link",
            "/api/auth/verify",
            "/api/payments/pricing",
            "/api/usage/check",
            "/api/history"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
