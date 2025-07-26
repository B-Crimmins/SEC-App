from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class AnalysisBase(BaseModel):
    financial_report_id: int


class AnalysisCreate(AnalysisBase):
    pass


class AnalysisResponse(AnalysisBase):
    id: int
    user_id: int
    summary: str
    key_takeaways: Optional[List[str]]

    risk_assessment: Optional[str]
    growth_analysis: Optional[str]
    liquidity_analysis: Optional[str]
    openai_model_used: Optional[str]
    tokens_used: Optional[int]
    processing_time: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True


class AnalysisRequest(BaseModel):
    ticker: str
    report_type: str
    period: str
    include_risk_assessment: bool = True
    include_growth_analysis: bool = True
    include_liquidity_analysis: bool = True


class TrendAnalysisRequest(BaseModel):
    ticker: str
    report_type: str
    periods: List[str]  # List of years like ["2023", "2022", "2021"]
    include_risk_assessment: bool = True
    include_growth_analysis: bool = True
    include_liquidity_analysis: bool = True


class TrendAnalysisResponse(BaseModel):
    company_ticker: str
    company_name: str
    report_type: str
    available_years: List[str]
    trend_analysis: Dict[str, Any]
    historical_data: Dict[str, Any]
    executive_summary: Optional[str] = ""
    revenue_trends: Optional[str] = ""
    profitability_trends: Optional[str] = ""
    balance_sheet_trends: Optional[str] = ""
    cash_flow_trends: Optional[str] = ""
    kpi_analysis: Optional[str] = ""
    risk_assessment: Optional[str] = ""
    future_outlook: Optional[str] = ""
    openai_model_used: Optional[str] = ""
    tokens_used: Optional[int] = 0
    processing_time: Optional[int] = 0 