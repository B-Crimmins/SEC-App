from pydantic import BaseModel
from typing import Optional, List


class CompanySearch(BaseModel):
    query: str


class CompanyInfo(BaseModel):
    ticker: str
    company_name: str
    cik: str
    sic: Optional[str] = None
    industry: Optional[str] = None
    sector: Optional[str] = None


class CompanySearchResponse(BaseModel):
    companies: List[CompanyInfo]
    total_count: int 