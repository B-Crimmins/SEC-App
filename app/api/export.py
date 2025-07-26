from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
from typing import Dict, Any
from app.database import get_db
from app.auth.auth import get_current_active_user
from app.models.user import User
from app.models.financial_report import FinancialReport
from app.models.analysis import Analysis
from app.utils.csv_export import export_financial_report_to_csv, export_analysis_to_csv, export_financial_data_simple_csv

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/{report_id}/csv")
async def export_financial_report_csv(
    report_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Export financial report data to CSV"""
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
    
    # Create CSV data using simple format utility function
    csv_data = export_financial_data_simple_csv(financial_report)
    
    # Create streaming response
    return StreamingResponse(
        io.StringIO(csv_data),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={financial_report.ticker}_{financial_report.report_type}_{financial_report.period}.csv"
        }
    )


@router.get("/{analysis_id}/analysis-csv")
async def export_analysis_csv(
    analysis_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Export analysis data to CSV"""
    # Get the analysis
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )
    
    # Create CSV data using utility function
    csv_data = export_analysis_to_csv(analysis)
    
    # Create streaming response
    return StreamingResponse(
        io.StringIO(csv_data),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=analysis_{analysis.id}.csv"
        }
    ) 