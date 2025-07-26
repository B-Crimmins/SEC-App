from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Dict, Any, cast
from app.database import get_db
from app.auth.auth import get_current_active_user
from app.services.sec_service import SECService
from app.services.user_service import UserService
from app.models.user import User, UserTier
from app.models.financial_report import FinancialReport
from app.schemas.financial_report import FinancialReportResponse, FinancialDataRequest
from app.utils.csv_export import export_financial_report_to_excel_format
import io

router = APIRouter(prefix="/api/companies", tags=["financials"])


@router.get("/{ticker}/financials", response_model=FinancialReportResponse)
async def get_financial_statements(
    ticker: str,
    report_type: str = Query(..., description="Report type (10-K, 10-Q, etc.)"),
    period: str = Query(..., description="Period (e.g., 2023, Q1 2023)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get financial statements for a company"""
    # Check API usage limits
    user_service = UserService(db)
    user_id = cast(int, current_user.id)
    usage = user_service.check_api_usage_limit(user_id)
    
    if usage['exceeded']:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}"
        )
    
    # First, get company information
    sec_service = SECService()
    companies_data = sec_service.search_companies(ticker)
    
    if not companies_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {ticker} not found"
        )
    
    # Find the exact match
    company_data = None
    for comp in companies_data:
        if comp['ticker'].upper() == ticker.upper():
            company_data = comp
            break
    
    if not company_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {ticker} not found"
        )
    
    # Check if we already have this report in the database
    existing_report = db.query(FinancialReport).filter(
        FinancialReport.user_id == current_user.id,
        FinancialReport.ticker == ticker.upper(),
        FinancialReport.report_type == report_type,
        FinancialReport.period == period
    ).first()
    
    if existing_report:
        return existing_report
    
    # Get financial data from SEC
    financial_data = sec_service.get_financial_statements(
        company_data['cik'],
        report_type,
        period
    )
    
    if not financial_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Financial data not found for {ticker} {report_type} {period}"
        )
    
    # Create financial report record in database
    financial_report = FinancialReport(
        user_id=current_user.id,
        ticker=ticker.upper(),
        company_name=company_data['company_name'],
        report_type=report_type,
        period=period,
        income_statement=financial_data.get('income_statement', {}),
        balance_sheet=financial_data.get('balance_sheet', {}),
        cash_flow=financial_data.get('cash_flow', {}),
        raw_data=str(financial_data)
    )
    
    db.add(financial_report)
    db.commit()
    db.refresh(financial_report)
    
    return financial_report


@router.get("/{ticker}/export")
async def export_financial_statements(
    ticker: str,
    report_type: str = Query(..., description="Report type (10-K, 10-Q, etc.)"),
    period: str = Query(..., description="Period (e.g., 2023, Q1 2023)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Export financial statements for a company"""
    # Check API usage limits
    user_service = UserService(db)
    user_id = cast(int, current_user.id)
    usage = user_service.check_api_usage_limit(user_id)
    
    if usage['exceeded']:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}"
        )
    
    # First, get company information
    sec_service = SECService()
    companies_data = sec_service.search_companies(ticker)
    
    if not companies_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {ticker} not found"
        )
    
    # Find the exact match
    company_data = None
    for comp in companies_data:
        if comp['ticker'].upper() == ticker.upper():
            company_data = comp
            break
    
    if not company_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {ticker} not found"
        )
    
    # Check if we already have this report in the database
    existing_report = db.query(FinancialReport).filter(
        FinancialReport.user_id == current_user.id,
        FinancialReport.ticker == ticker.upper(),
        FinancialReport.report_type == report_type,
        FinancialReport.period == period
    ).first()
    
    if not existing_report:
        # Get financial data from SEC
        financial_data = sec_service.get_financial_statements(
            company_data['cik'],
            report_type,
            period
        )
        
        if not financial_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Financial data not found for {ticker} {report_type} {period}"
            )
        
        # Create financial report record in database
        financial_report = FinancialReport(
            user_id=current_user.id,
            ticker=ticker.upper(),
            company_name=company_data['company_name'],
            report_type=report_type,
            period=period,
            income_statement=financial_data.get('income_statement', {}),
            balance_sheet=financial_data.get('balance_sheet', {}),
            cash_flow=financial_data.get('cash_flow', {}),
            raw_data=str(financial_data)
        )
        
        db.add(financial_report)
        db.commit()
        db.refresh(financial_report)
    else:
        financial_report = existing_report
    
    # Generate CSV export
    csv_content = export_financial_report_to_excel_format(financial_report)
    
    # Create filename
    filename = f"{ticker}_{report_type}_{period}_financial_statements.csv"
    
    # Return as streaming response
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/financial-statements/{report_id}")
async def get_financial_statements_by_id(
    report_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get financial statements data by report ID for interactive display"""
    # Get the financial report
    financial_report = db.query(FinancialReport).filter(
        FinancialReport.id == report_id,
        FinancialReport.user_id == current_user.id
    ).first()
    
    if not financial_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial report not found"
        )
    
    # Format the data for frontend consumption
    formatted_data = {
        'income_statement': financial_report.income_statement or {},
        'balance_sheet': financial_report.balance_sheet or {},
        'cash_flow': financial_report.cash_flow or {},
        'metadata': {
            'ticker': financial_report.ticker,
            'company_name': financial_report.company_name,
            'report_type': financial_report.report_type,
            'period': financial_report.period,
            'filing_date': financial_report.filing_date,
            'created_at': financial_report.created_at
        }
    }
    
    return formatted_data


@router.get("/{ticker}/financials/history", response_model=list[FinancialReportResponse])
async def get_financial_history(
    ticker: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get financial history for a company"""
    reports = db.query(FinancialReport).filter(
        FinancialReport.user_id == current_user.id,
        FinancialReport.ticker == ticker.upper()
    ).order_by(FinancialReport.created_at.desc()).all()
    
    return reports 