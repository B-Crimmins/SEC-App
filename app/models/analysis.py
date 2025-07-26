from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Analysis(Base):
    __tablename__ = "analyses"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    financial_report_id = Column(Integer, ForeignKey("financial_reports.id"), nullable=False)
    
    # Analysis content
    summary = Column(Text, nullable=False)
    key_takeaways = Column(JSON)  # Store as JSON array

    risk_assessment = Column(Text)
    growth_analysis = Column(Text)
    liquidity_analysis = Column(Text)
    statement_flow_explanations = Column(JSON)  # Store flow explanations as JSON
    
    # AI metadata
    openai_model_used = Column(String)
    tokens_used = Column(Integer)
    processing_time = Column(Integer)  # in seconds
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="analyses")
    financial_report = relationship("FinancialReport", back_populates="analyses") 