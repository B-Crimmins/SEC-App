from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any, cast, List
from database import get_db
from auth.auth import get_current_active_user
from services.openai_service import OpenAIService
from services.sec_service import SECService
from services.user_service import UserService
from services.financial_ratios import FinancialRatioCalculator
from services.segment_analysis import SegmentAnalysisService
from services.common_size import calculate_common_size_multi_period
from models.user import User
from models.financial_report import FinancialReport
from models.analysis import Analysis
from schemas.analysis import AnalysisResponse, AnalysisRequest, TrendAnalysisRequest, TrendAnalysisResponse, TrendRequestTest, DCFRequest, DCFResponse

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("/generate", response_model=AnalysisResponse)
async def generate_analysis(
    analysis_request: AnalysisRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Generate AI-powered financial analysis"""
    print(f"🔍 ANALYSIS GENERATION STARTED for {analysis_request.ticker}")
    # Check API usage limits
    user_service = UserService(db)
    usage = user_service.check_api_usage_limit(cast(int, current_user.id))
    
    # Get or create financial report
    sec_service = SECService()
    companies_data = sec_service.search_companies(analysis_request.ticker)
    
    if not companies_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {analysis_request.ticker} not found"
        )
    
    # Find the exact match
    company_data = None
    for comp in companies_data:
        if comp['ticker'].upper() == analysis_request.ticker.upper():
            company_data = comp
            break
    
    if not company_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {analysis_request.ticker} not found"
        )
    
    # Get or create financial report
    financial_report = db.query(FinancialReport).filter(
        FinancialReport.user_id == current_user.id,
        FinancialReport.ticker == analysis_request.ticker.upper(),
        FinancialReport.report_type == analysis_request.report_type,
        FinancialReport.period == analysis_request.period
    ).first()
    if not financial_report:
        # Get financial data from SEC
        financial_data = sec_service.get_financial_statements(
            company_data['cik'],
            analysis_request.report_type,
            analysis_request.period
        )
        
        if not financial_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Financial data not found for {analysis_request.ticker} {analysis_request.report_type} {analysis_request.period}"
            )
        
        # Debug: Check what SEC service returned
        print(f"🔍 SEC Service returned financial data:")
        print(f"  Income Statement Items: {len(financial_data.get('income_statement', {}))}")
        print(f"  Balance Sheet Items: {len(financial_data.get('balance_sheet', {}))}")
        print(f"  Cash Flow Items: {len(financial_data.get('cash_flow', {}))}")

        # Show sample of what we're storing
        if financial_data.get('income_statement'):
            sample_key = list(financial_data['income_statement'].keys())[0]
            sample_data = financial_data['income_statement'][sample_key]
            print(f"  Sample SEC Income Item: {sample_key} = {sample_data}")
        
        # Create financial report
        financial_report = FinancialReport(
            user_id=current_user.id,
            ticker=analysis_request.ticker.upper(),
            company_name=company_data['company_name'],
            report_type=analysis_request.report_type,
            period=analysis_request.period,
            income_statement=financial_data.get('income_statement', {}),
            balance_sheet=financial_data.get('balance_sheet', {}),
            cash_flow=financial_data.get('cash_flow', {}),
            raw_data=str(financial_data)
        )
        
        db.add(financial_report)
        db.commit()
        db.refresh(financial_report)
        
        print(f"✅ Financial report created with ID: {financial_report.id}")
    
    # Check if analysis already exists
    existing_analysis = db.query(Analysis).filter(
        Analysis.user_id == current_user.id,
        Analysis.financial_report_id == financial_report.id
    ).first()
    
    print(f"🔍 CHECKING FOR EXISTING ANALYSIS: {existing_analysis is not None}")
    
    # if existing_analysis:
    #     print(f"🔍 RETURNING EXISTING ANALYSIS: {existing_analysis.id}")
    #     return existing_analysis
    
    print(f"🔍 NO EXISTING ANALYSIS FOUND, GENERATING NEW ONE")
    
    # Generate AI analysis
    try:
        openai_service = OpenAIService()
        
        # Debug: Check what financial data we have
        print(f"🔍 Debugging financial data for analysis:")
        print(f"  Financial Report ID: {financial_report.id}")
        print(f"  Income Statement Items: {len(cast(dict, financial_report.income_statement) or {})}")
        print(f"  Balance Sheet Items: {len(cast(dict, financial_report.balance_sheet) or {})}")
        print(f"  Cash Flow Items: {len(cast(dict, financial_report.cash_flow) or {})}")
        
        # Show sample data structure
        if financial_report.income_statement is not None and len(cast(dict, financial_report.income_statement)) > 0:
            sample_key = list(financial_report.income_statement.keys())[0]
            sample_data = financial_report.income_statement[sample_key]
            print(f"  Sample Income Item: {sample_key} = {sample_data}")
        else:
            print(f"  No income statement data available")
        
        # Prepare financial data for analysis
        financial_data = {
            'income_statement': financial_report.income_statement or {},
            'balance_sheet': financial_report.balance_sheet or {},
            'cash_flow': financial_report.cash_flow or {}
        }
        
        print(f"  Data being sent to OpenAI:")
        print(f"    Income Statement: {len(cast(dict, financial_data['income_statement']))} items")
        print(f"    Balance Sheet: {len(cast(dict, financial_data['balance_sheet']))} items")
        print(f"    Cash Flow: {len(cast(dict, financial_data['cash_flow']))} items")
        
        analysis_result = openai_service.analyze_financial_data(
            financial_data,
            analysis_request.ticker,
            analysis_request.report_type,
            analysis_request.period
        )
        
        print(f"🔍 ANALYSIS RESULT GENERATED SUCCESSFULLY")
        
        # Generate statement flow explanations
        print(f"🔍 ABOUT TO GENERATE FLOW EXPLANATIONS FOR {analysis_request.ticker}")
        try:
            flow_result = openai_service.generate_statement_flow_explanations(
                financial_data,
                analysis_request.ticker
            )
            print(f"🔍FLOW RESULT: {flow_result}")
        except Exception as e:
            print(f"❌ ERROR IN FLOW EXPLANATIONS: {e}")
            import traceback
            traceback.print_exc()
            # Provide a default empty result
            flow_result = {
                'flow_explanations': {},
                'tokens_used': 0,
                'processing_time': 0
            }
        
        # Create analysis record
        analysis = Analysis(
            user_id=current_user.id,
            financial_report_id=financial_report.id,
            summary=analysis_result['summary'],
            key_takeaways=analysis_result['key_takeaways'],

            risk_assessment=analysis_result['risk_assessment'],
            growth_analysis=analysis_result['growth_analysis'],
            liquidity_analysis=analysis_result['liquidity_analysis'],
            statement_flow_explanations=flow_result['flow_explanations'],
            openai_model_used=analysis_result['openai_model_used'],
            tokens_used=analysis_result['tokens_used'] + flow_result['tokens_used'],
            processing_time=analysis_result['processing_time'] + flow_result['processing_time']
        )
        
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        
        return analysis
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating analysis: {str(e)}"
        )


@router.post("/test-this")
async def generate_trend_analysis(
    analysis_request: TrendRequestTest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    sec_service = SECService()    
    ticks: List[str] = []
    
    for t in analysis_request.ticker:
        companies_data = sec_service.search_companies(t)
        
        if not companies_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Company with ticker {analysis_request.ticker} not found"
            )
        
        ticks.append(str(companies_data[0]['cik']))
    

    # Needs the report type
    r = sec_service.GetMultiParsedData(ticks, analysis_request.periods)

    return r

@router.post("/try-ratios")
async def generate_trend_analysis(
    analysis_request: TrendAnalysisRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
    
    
):
    sec_service = SECService()    
    thing = sec_service.GetRatios(["789019", "320193"], ["2020","2021"])

    return thing

    

@router.post("/trend-analysis", response_model=TrendAnalysisResponse)
async def generate_trend_analysis(
    analysis_request: TrendAnalysisRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Generate AI-powered historical trend analysis for multiple years"""
    # Check API usage limits
    user_service = UserService(db)
    usage = user_service.check_api_usage_limit(cast(int, current_user.id))
    
    if usage['exceeded']:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}"
        )
    
    # Check if user has access to AI analysis (paid tier)
    # if current_user.tier.value == "free":
    #     raise HTTPException(
    #         status_code=status.HTTP_403_FORBIDDEN,
    #         detail="AI analysis is only available for paid users. Please upgrade your subscription."
    #     )
    
    # Get company data
    sec_service = SECService()
    companies_data = sec_service.search_companies(analysis_request.ticker)
    
    if not companies_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {analysis_request.ticker} not found"
        )
    
    # Find the exact match
    company_data = None
    for comp in companies_data:
        if comp['ticker'].upper() == analysis_request.ticker.upper():
            company_data = comp
            break
    
    if not company_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {analysis_request.ticker} not found"
        )
    
    # Use the periods list directly
    periods = analysis_request.periods
    
    # Get historical financial data
    historical_data = sec_service.get_financial_statements_multiple_years(
        company_data['cik'],
        analysis_request.report_type,
        periods
    )
    
    if not historical_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Historical financial data not found for {analysis_request.ticker}"
        )
    
    # Generate AI trend analysis
    try:
        openai_service = OpenAIService()
        
        trend_analysis = openai_service.analyze_historical_trends(
            historical_data,
            analysis_request.ticker,
            analysis_request.report_type
        )
        
        # Generate line item trend analysis
        line_item_analysis = openai_service.generate_line_item_trend_analysis(
            historical_data,
            analysis_request.ticker,
            analysis_request.report_type
        )
        
        return {
            "company_ticker": analysis_request.ticker,
            "company_name": company_data['company_name'],
            "report_type": analysis_request.report_type,
            "available_years": historical_data['available_years'],
            "trend_analysis": trend_analysis,
            "historical_data": historical_data['historical_data'],
            "line_item_trends": line_item_analysis.get('line_item_trends', {}),
            "executive_summary": trend_analysis.get('executive_summary', ''),
            "revenue_trends": trend_analysis.get('revenue_trends', ''),
            "profitability_trends": trend_analysis.get('profitability_trends', ''),
            "balance_sheet_trends": trend_analysis.get('balance_sheet_trends', ''),
            "cash_flow_trends": trend_analysis.get('cash_flow_trends', ''),
            "kpi_analysis": trend_analysis.get('kpi_analysis', ''),
            "risk_assessment": trend_analysis.get('risk_assessment', ''),
            "future_outlook": trend_analysis.get('future_outlook', ''),
            "openai_model_used": trend_analysis.get('openai_model_used', ''),
            "tokens_used": trend_analysis.get('tokens_used', 0) + line_item_analysis.get('tokens_used', 0),
            "processing_time": trend_analysis.get('processing_time', 0) + line_item_analysis.get('processing_time', 0)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating trend analysis: {str(e)}"
        )


@router.post("/revenue-segments", response_model=Dict[str, Any])
async def get_revenue_segments(
    analysis_request: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Revenue segment breakdown (product, geography, business segment) per period.

    Request body: { "ticker": "AAPL", "report_type": "10-K", "periods": ["2023","2024"] }
    """
    ticker = (analysis_request.get("ticker") or "").strip()
    report_type = analysis_request.get("report_type", "10-K")
    periods = analysis_request.get("periods", [])

    if not ticker or not periods:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ticker and periods are required",
        )

    sec_service = SECService()
    companies_data = sec_service.search_companies(ticker)
    if not companies_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {ticker} not found",
        )

    company_data = next(
        (c for c in companies_data if c['ticker'].upper() == ticker.upper()),
        None,
    )
    if not company_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {ticker} not found",
        )

    segment_service = SegmentAnalysisService(sec_service)
    segments = segment_service.get_revenue_segments_multi_period(
        company_data['cik'], report_type, periods
    )

    return {
        "ticker": ticker.upper(),
        "company_name": company_data['company_name'],
        "cik": company_data['cik'],
        "report_type": report_type,
        "periods": segments["periods"],
        "by_period": segments["by_period"],
    }


@router.post("/common-size", response_model=Dict[str, Any])
async def get_common_size(
    analysis_request: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Common-size income statement ratios across one or more peer tickers.

    Request body: { "tickers": ["AAPL","MSFT"], "report_type": "10-K", "periods": ["2023","2024"] }
    Accepts legacy single `ticker` key too.
    """
    raw_tickers = analysis_request.get("tickers")
    if not raw_tickers:
        single = analysis_request.get("ticker")
        raw_tickers = [single] if single else []

    tickers = [t.strip().upper() for t in raw_tickers if t and t.strip()]
    report_type = analysis_request.get("report_type", "10-K")
    periods = analysis_request.get("periods", [])

    if not tickers or not periods:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tickers and periods are required",
        )

    sec_service = SECService()
    ratio_calculator = FinancialRatioCalculator()

    companies_out: List[Dict[str, Any]] = []
    covered_years: List[str] = []

    for ticker in tickers:
        companies_data = sec_service.search_companies(ticker)
        company_data = next(
            (c for c in (companies_data or []) if c['ticker'].upper() == ticker),
            None,
        )
        if not company_data:
            continue

        result = calculate_common_size_multi_period(
            sec_service, ratio_calculator, company_data['cik'], report_type, periods
        )

        # Reshape by_period -> {year: {ratios: {...}}} so the frontend mirrors
        # the RatioAnalysis component's data contract.
        periods_payload: Dict[str, Any] = {}
        for year, ratios in result["by_period"].items():
            periods_payload[year] = {"ratios": ratios}

        for year in result["periods"]:
            if year not in covered_years:
                covered_years.append(year)

        companies_out.append({
            "ticker": ticker,
            "company_name": company_data['company_name'],
            "cik": company_data['cik'],
            "periods": periods_payload,
        })

    if not companies_out:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No companies found for given tickers",
        )

    # Preserve requested order where possible; fall back to covered order.
    years_sorted = [p for p in periods if p in covered_years] or covered_years

    return {
        "tickers": tickers,
        "report_type": report_type,
        "years": years_sorted,
        "companies": companies_out,
    }


@router.post("/peer-group-analysis", response_model=Dict[str, Any])
async def generate_peer_group_analysis(
    analysis_request: dict,  # Will contain tickers, report_type, periods
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Check API usage limits
    user_service = UserService(db)
    usage = user_service.check_api_usage_limit(cast(int, current_user.id))
    
    if usage['exceeded']:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}"
        )
    
    # Check if user has access to peer group analysis (paid tier)
    # print(f"🔍 Debug: User tier = {current_user.tier.value}")
    # if current_user.tier.value == "free":
    #     raise HTTPException(
    #         status_code=status.HTTP_403_FORBIDDEN,
    #         detail="Peer group analysis is only available for paid users. Please upgrade your subscription."
    #     )
    
    tickers = analysis_request.get('tickers', [])
    report_type = analysis_request.get('report_type', '10-K')
    periods = analysis_request.get('periods', [])
    
    if not tickers or not periods:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tickers and periods are required"
        )
    
    # Get company data for all tickers
    sec_service = SECService()
    companies_data = {}
    
    #Optimize, this loop is running an API call too often. 
    for ticker in tickers:
        companies = sec_service.search_companies(ticker)
        if companies:
            for comp in companies:
                if comp['ticker'].upper() == ticker.upper():
                    companies_data[ticker] = comp
                    break
    
    if not companies_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="None of the requested companies were found"
        )
    
    # Fetch real financial data for each company and period
    peer_group_data = {}
    
    for ticker, company_data in companies_data.items():
        cik = company_data['cik']
        company_periods = {}
        
        for period in periods:
            financial_data = sec_service.get_financial_statements(cik, report_type, period)
            if financial_data:
                company_periods[period] = financial_data
        
        if company_periods:
            peer_group_data[ticker] = {
                'company_name': company_data['company_name'],
                'cik': cik,
                'periods': company_periods
            }
    
    if not peer_group_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No financial data found for the requested companies and periods"
        )
    
    # Calculate financial ratios for peer group
    try:
        ratio_calculator = FinancialRatioCalculator()
        calculated_ratios = ratio_calculator.calculate_peer_group_ratios(peer_group_data)       
        
        # Generate AI analysis for peer group
        openai_service = OpenAIService()
        
        # Create a summary of the peer group data for AI analysis
        analysis_summary = {
            'companies': len(peer_group_data),
            'periods': periods,
            'report_type': report_type,
            'data_available': {}
        }
        
        for ticker, data in peer_group_data.items():
            analysis_summary['data_available'][ticker] = {
                'company_name': data['company_name'],
                'periods_with_data': list(data['periods'].keys())
            }
        
        # Generate peer group analysis
        # ai_analysis = openai_service.analyze_peer_group(peer_group_data)
        
        return {
            # "peer_group_data": peer_group_data,
            "calculated_ratios": calculated_ratios,
            # "analysis_summary": analysis_summary,
            # "executive_summary": ai_analysis.get('executive_summary', ''),
            # "revenue_trends": ai_analysis.get('revenue_trends', ''),
            # "risk_assessment": ai_analysis.get('risk_assessment', ''),
            # "openai_model_used": ai_analysis.get('openai_model_used', ''),
            # "tokens_used": ai_analysis.get('tokens_used', 0),
            # "processing_time": ai_analysis.get('processing_time', 0)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating peer group analysis: {str(e)}"
        )


@router.get("/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific analysis"""
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )
    
    return analysis


@router.get("/history", response_model=list[AnalysisResponse])
async def get_analysis_history(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user's analysis history"""
    analyses = db.query(Analysis).filter(
        Analysis.user_id == current_user.id
    ).order_by(Analysis.created_at.desc()).all()
    
    return analyses


@router.get("/{analysis_id}/ratios", response_model=Dict[str, Any])
async def get_financial_ratios(
    analysis_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get calculated financial ratios for a specific analysis"""
    # Get the analysis and associated financial report
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )
    
    # Get the financial report
    financial_report = analysis.financial_report
    
    if not financial_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial report not found"
        )
    
    # Calculate ratios
    try:
        ratio_calculator = FinancialRatioCalculator()
        
        financial_data = {
            'income_statement': financial_report.income_statement or {},
            'balance_sheet': financial_report.balance_sheet or {},
            'cash_flow': financial_report.cash_flow or {}
        }
        
        ratios_result = ratio_calculator.calculate_single_company_ratios(financial_data)
        
        return {
            "analysis_id": analysis_id,
            "ticker": financial_report.ticker,
            "company_name": financial_report.company_name,
            "report_type": financial_report.report_type,
            "period": financial_report.period,
            "ratios": ratios_result
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculating ratios: {str(e)}"
        )


@router.post("/dcf", response_model=DCFResponse)
async def calculate_dcf(
    dcf_request: DCFRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Calculate DCF valuation for a company"""
    # Check API usage limits
    user_service = UserService(db)
    usage = user_service.check_api_usage_limit(cast(int, current_user.id))
    
    if usage['exceeded']:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}"
        )
    
    # Get or create financial report
    sec_service = SECService()
    companies_data = sec_service.search_companies(dcf_request.ticker)
    
    if not companies_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {dcf_request.ticker} not found"
        )
    
    # Find the exact match
    company_data = None
    for comp in companies_data:
        if comp['ticker'].upper() == dcf_request.ticker.upper():
            company_data = comp
            break
    
    if not company_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Company with ticker {dcf_request.ticker} not found"
        )
    
    # Get or create financial report
    financial_report = db.query(FinancialReport).filter(
        FinancialReport.user_id == current_user.id,
        FinancialReport.ticker == dcf_request.ticker.upper(),
        FinancialReport.report_type == dcf_request.report_type,
        FinancialReport.period == dcf_request.period
    ).first()
    
    if not financial_report:
        # Get financial data from SEC
        financial_data = sec_service.get_financial_statements(
            company_data['cik'],
            dcf_request.report_type,
            dcf_request.period
        )
        
        if not financial_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Financial data not found for {dcf_request.ticker} {dcf_request.report_type} {dcf_request.period}"
            )
        
        # Create financial report
        financial_report = FinancialReport(
            user_id=current_user.id,
            ticker=dcf_request.ticker.upper(),
            company_name=company_data['company_name'],
            report_type=dcf_request.report_type,
            period=dcf_request.period,
            income_statement=financial_data.get('income_statement', {}),
            balance_sheet=financial_data.get('balance_sheet', {}),
            cash_flow=financial_data.get('cash_flow', {}),
            raw_data=str(financial_data)
        )
        
        db.add(financial_report)
        db.commit()
        db.refresh(financial_report)
    
    # Calculate DCF
    ratio_calculator = FinancialRatioCalculator()
    financial_data = {
        'income_statement': financial_report.income_statement,
        'balance_sheet': financial_report.balance_sheet,
        'cash_flow': financial_report.cash_flow
    }
    
    try:
        dcf_result = ratio_calculator.present_values_fcf(
            financial_data,
            dcf_request.discount_rate,
            dcf_request.interim_growth_rate,
            dcf_request.terminal_growth_rate,
            dcf_request.forecast_periods,
            stock_price=dcf_request.stock_price,
        )

        return DCFResponse(
            ticker=financial_report.ticker,
            company_name=financial_report.company_name,
            report_type=financial_report.report_type,
            period=financial_report.period,
            latest_year=dcf_result['latest_year'],
            discount_rate=dcf_request.discount_rate,
            interim_growth_rate=dcf_request.interim_growth_rate,
            terminal_growth_rate=dcf_request.terminal_growth_rate,
            forecast_periods=dcf_request.forecast_periods,
            stock_price=dcf_request.stock_price,
            projected_fcf=dcf_result['projected_fcf'],
            present_values=dcf_result['present_values'],
            terminal_value=dcf_result['terminal_value'],
            enterprise_value=dcf_result['enterprise_value'],
            equity_value=dcf_result['equity_value'],
            per_share_value=dcf_result['per_share_value']
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculating DCF: {str(e)}"
        ) 