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


class TrendRequestTest(BaseModel):
    ticker: List[str]
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


class DCFRequest(BaseModel):
    ticker: str
    report_type: str
    period: str
    discount_rate: float
    interim_growth_rate: float
    terminal_growth_rate: float
    forecast_periods: int = 5
    stock_price: float


class DCFResponse(BaseModel):
    ticker: str
    company_name: str
    report_type: str
    period: str
    latest_year: int
    discount_rate: float
    interim_growth_rate: float
    terminal_growth_rate: float
    forecast_periods: int
    stock_price: float
    projected_fcf: List[float]
    present_values: List[float]
    terminal_value: float
    enterprise_value: float
    equity_value: float
    per_share_value: float


class ReverseDCFRequest(BaseModel):
    ticker: str
    report_type: str
    period: str
    target_price: float  # current market price we want the DCF to justify
    # Which assumption to solve for; the others are held constant.
    # Allowed values: 'revenue_growth' | 'operating_margin' | 'wacc' | 'terminal_growth'
    solve_for: str
    # Held-constant assumptions (decimals: 0.10 = 10%).
    discount_rate: float
    interim_growth_rate: float
    terminal_growth_rate: float
    forecast_periods: int = 5
    # Optional bounds override for the brentq solver (decimals).
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None


class ReverseDCFResponse(BaseModel):
    ticker: str
    company_name: str
    report_type: str
    period: str
    target_price: float
    solve_for: str
    # The solved value (decimal — caller formats as needed).
    implied_value: Optional[float] = None
    # The price the DCF produced at the solved value (sanity check).
    dcf_price_at_solution: Optional[float] = None
    # Inputs echoed back so the UI can show the constants used.
    held_constant: Dict[str, float] = {}
    # Bounds used by the solver.
    search_bounds: Dict[str, float] = {}
    converged: bool = False
    notes: List[str] = []


class WACCRequest(BaseModel):
    ticker: str
    report_type: str
    period: str
    # User-supplied capital-market assumptions (decimals: 0.045 = 4.5%).
    beta: float
    risk_free_rate: float
    expected_market_return: float
    stock_price: float
    cost_of_debt: float
    cost_of_preferred: float


class WACCResponse(BaseModel):
    ticker: str
    company_name: str
    report_type: str
    period: str
    # Inputs echoed back.
    beta: float
    risk_free_rate: float
    expected_market_return: float
    stock_price: float
    cost_of_debt: float
    cost_of_preferred: float
    # Capital structure pulled from filings.
    shares_outstanding: Optional[float] = None
    long_term_debt: Optional[float] = None
    preferred_stock: Optional[float] = None
    market_cap: Optional[float] = None
    total_capital: Optional[float] = None
    weight_equity: Optional[float] = None
    weight_debt: Optional[float] = None
    weight_preferred: Optional[float] = None
    # Cost components (decimals).
    cost_of_equity: Optional[float] = None
    after_tax_cost_of_debt: Optional[float] = None
    effective_tax_rate: Optional[float] = None
    wacc: Optional[float] = None
    # Warnings about missing inputs / fallbacks taken.
    notes: List[str] = []