from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class FinancialReport(Base):
    __tablename__ = "financial_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False, index=True)
    company_name = Column(String, nullable=False)
    report_type = Column(String, nullable=False)  # 10-K, 10-Q, etc.
    period = Column(String, nullable=False)  # Year or quarter
    filing_date = Column(DateTime(timezone=True))
    
    # Financial data
    income_statement = Column(JSON)  # Store as JSON
    balance_sheet = Column(JSON)
    cash_flow = Column(JSON)
    
    # Metadata
    sec_filing_url = Column(String)
    raw_data = Column(Text)  # Store raw SEC data
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="financial_reports")
    analyses = relationship("Analysis", back_populates="financial_report") 