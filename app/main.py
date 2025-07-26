from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import cast
import uvicorn

from app.config import settings
from app.database import engine, Base
from app.api import (
    auth_router,
    companies_router,
    financials_router,
    analysis_router,
    subscriptions_router,
    export_router
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")
    
    yield
    
    # Shutdown
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="A comprehensive API wrapper for SEC financial data with AI-powered analysis",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files are not used in this API-only application

# Include routers
app.include_router(auth_router)
app.include_router(companies_router)
app.include_router(financials_router)
app.include_router(analysis_router)
app.include_router(subscriptions_router)
app.include_router(export_router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to SEC Financial Data Wrapper API",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": settings.APP_NAME}


@app.get("/api/usage-limits")
async def get_usage_limits():
    """Get API usage limits for different tiers"""
    return {
        "free_tier": {
            "monthly_limit": settings.FREE_TIER_LIMIT,
            "features": [
                "Basic financial data access",
                "Standard CSV export",
                "Company search"
            ]
        },
        "paid_tier": {
            "monthly_limit": settings.PAID_TIER_LIMIT,
            "features": [
                "Unlimited API calls",
                "Advanced AI analysis",
                "Priority processing",
                "Extended data retention",
                "Advanced CSV export"
            ]
        }
    }


@app.get("/api/test-export/{report_id}")
async def test_export(report_id: int):
    """Test endpoint to check if export works"""
    from app.database import SessionLocal
    from app.models.financial_report import FinancialReport
    from app.utils.csv_export import export_financial_data_simple_csv
    
    db = SessionLocal()
    try:
        report = db.query(FinancialReport).filter(FinancialReport.id == report_id).first()
        if report:
            try:
                # Test the export function
                csv_data = export_financial_data_simple_csv(report)
                return {
                    "exists": True,
                    "ticker": report.ticker,
                    "period": report.period,
                    "user_id": report.user_id,
                    "csv_length": len(csv_data),
                    "income_statement_items": len(cast(dict, report.income_statement)) if report.income_statement is not None else 0,
                    "balance_sheet_items": len(cast(dict, report.balance_sheet)) if report.balance_sheet is not None else 0,
                    "cash_flow_items": len(cast(dict, report.cash_flow)) if report.cash_flow is not None else 0
                }
            except Exception as e:
                return {
                    "exists": True,
                    "error": str(e),
                    "ticker": report.ticker,
                    "period": report.period
                }
        else:
            return {"exists": False, "message": f"No financial report with ID {report_id}"}
    finally:
        db.close()


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    ) 