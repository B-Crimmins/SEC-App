from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class FinancialReportBase(BaseModel):
    ticker: str
    company_name: str
    report_type: str  # 10-K, 10-Q, etc.
    period: str  # Year or quarter


class FinancialReportCreate(FinancialReportBase):
    pass


class FinancialReportResponse(FinancialReportBase):
    id: int
    user_id: int
    filing_date: Optional[datetime]
    income_statement: Optional[Dict[str, Any]]
    balance_sheet: Optional[Dict[str, Any]]
    cash_flow: Optional[Dict[str, Any]]
    sec_filing_url: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class FinancialDataRequest(BaseModel):
    ticker: str
    report_type: str
    period: str 