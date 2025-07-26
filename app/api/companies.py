from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, cast
from app.database import get_db
from app.auth.auth import get_current_active_user
from app.services.sec_service import SECService
from app.services.user_service import UserService
from app.schemas.company import CompanySearch, CompanyInfo, CompanySearchResponse
from app.models.user import User

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("/search", response_model=CompanySearchResponse)
async def search_companies(
    query: str = Query(..., description="Company ticker or name to search for"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Search for companies by ticker or name"""
    # Check API usage limits
    user_service = UserService(db)
    user_id = cast(int, current_user.id)
    usage = user_service.check_api_usage_limit(user_id)
    
    if usage['exceeded']:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}"
        )
    
    # Search for companies
    sec_service = SECService()
    companies_data = sec_service.search_companies(query)
    
    # Convert to response format
    companies = []
    for company_data in companies_data:
        company = CompanyInfo(
            ticker=company_data['ticker'],
            company_name=company_data['company_name'],
            cik=company_data['cik'],
            sic=company_data.get('sic'),
            industry=company_data.get('industry')
        )
        companies.append(company)
    
    return CompanySearchResponse(
        companies=companies,
        total_count=len(companies)
    )


@router.get("/{ticker}/info", response_model=CompanyInfo)
async def get_company_info(
    ticker: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get detailed company information"""
    # Check API usage limits
    user_service = UserService(db)
    user_id = cast(int, current_user.id)
    usage = user_service.check_api_usage_limit(user_id)
    
    if usage['exceeded']:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}"
        )
    
    # Search for the specific company
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
    
    return CompanyInfo(
        ticker=company_data['ticker'],
        company_name=company_data['company_name'],
        cik=company_data['cik'],
        sic=company_data.get('sic'),
        industry=company_data.get('industry')
    ) 