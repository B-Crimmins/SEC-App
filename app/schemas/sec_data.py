from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime

class SECValue(BaseModel):
    """Represents a single SEC data value"""
    end: Optional[str] = None  # End date of period
    val: Optional[float] = None  # The actual value
    accn: Optional[str] = None  # Accession number
    fy: Optional[int] = None  # Fiscal year
    fp: Optional[str] = None  # Fiscal period (FY, Q1, Q2, etc.)
    form: Optional[str] = None  # Form type (10-K, 10-Q, etc.)
    filed: Optional[str] = None  # Filing date

class SECConcept(BaseModel):
    """Represents a financial concept with its units and values"""
    label: Optional[str] = None
    description: Optional[str] = None
    units: Dict[str, List[SECValue]] = {}

class SECFacts(BaseModel):
    """Represents the facts section of SEC company data"""
    us_gaap: Optional[Dict[str, SECConcept]] = {}
    dei: Optional[Dict[str, SECConcept]] = {}

class SECCompanyFacts(BaseModel):
    """Represents the complete company facts response"""
    cik: int
    entityName: str
    facts: SECFacts

class SECFiling(BaseModel):
    """Represents a single filing"""
    accessionNumber: str
    filingDate: str
    reportDate: Optional[str] = None
    acceptanceDateTime: str
    act: str
    form: str
    fileNumber: Optional[str] = None
    filmNumber: Optional[str] = None
    items: Optional[str] = None
    size: Optional[int] = None
    isXBRL: bool
    isInlineXBRL: bool
    primaryDocument: str
    primaryDocDescription: Optional[str] = None

class SECRecentFilings(BaseModel):
    """Represents recent filings data"""
    accessionNumber: List[str]
    filingDate: List[str]
    reportDate: List[str]
    acceptanceDateTime: List[str]
    act: List[str]
    form: List[str]
    fileNumber: List[str]
    filmNumber: List[str]
    items: List[str]
    size: List[int]
    isXBRL: List[bool]
    isInlineXBRL: List[bool]
    primaryDocument: List[str]
    primaryDocDescription: List[str]

class SECFilings(BaseModel):
    """Represents the filings section"""
    recent: SECRecentFilings
    files: Dict[str, Any] = {}

class SECSubmissions(BaseModel):
    """Represents the complete submissions response"""
    cik: int
    entityType: str
    sic: Optional[str] = None
    sicDescription: Optional[str] = None
    name: str
    tickers: List[str]
    exchanges: List[str]
    ein: Optional[str] = None
    lei: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    investorWebsite: Optional[str] = None
    category: Optional[str] = None
    fiscalYearEnd: Optional[str] = None
    stateOfIncorporation: Optional[str] = None
    stateOfIncorporationDescription: Optional[str] = None
    addresses: Dict[str, Any] = {}
    phone: Optional[str] = None
    flags: Dict[str, Any] = {}
    formerNames: List[Dict[str, Any]] = []
    filings: SECFilings 