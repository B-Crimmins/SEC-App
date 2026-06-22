from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any, cast, List, Optional
from database import get_db
from auth.auth import get_current_active_user
from services.openai_service import OpenAIService
from services.sec_service import SECService
from services.user_service import UserService
from services.financial_ratios import FinancialRatioCalculator
from services.segment_analysis import SegmentAnalysisService
from services.common_size import calculate_common_size_multi_period
from services.peer_scorecard import PeerScorecardService
from services import screener_cache
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
    

    r = sec_service.GetMultiParsedData(
        ticks, analysis_request.periods, analysis_request.report_type
    )

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


# NOTE: parametric `/{analysis_id}` routes are declared at the END of this
# file. FastAPI matches routes in declaration order — a `/{analysis_id}`
# defined here would intercept every later literal-path GET (`/screener`,
# `/screener/options`, ...) and 422 on int-coercion. The two parametric
# routes live below all literal routes for that reason.


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


@router.post("/peer-scorecard", response_model=Dict[str, Any])
async def generate_peer_scorecard(
    request: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Quantitative peer scorecard for the Relative Valuation portal.

    Request body: { tickers: [str, ...], industry_profile: "cyclical"|"asset_light" }

    Methodology is implemented in services/peer_scorecard.py per spec:
    rank (0-50) + absolute (0-50; logistic for tail risk) per sub-metric,
    weighted_mean - 0.5*sigma per pillar, composite by industry weights,
    sensitivity over weight +/-10pp and threshold midpoint +/-20%.
    """
    user_service = UserService(db)
    usage = user_service.check_api_usage_limit(cast(int, current_user.id))
    if usage["exceeded"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}",
        )

    tickers = [t.strip().upper() for t in (request.get("tickers") or []) if isinstance(t, str) and t.strip()]
    industry_profile = request.get("industry_profile")

    if len(tickers) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 tickers are required for a peer scorecard.",
        )
    if industry_profile not in ("cyclical", "asset_light"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="industry_profile must be 'cyclical' or 'asset_light'. "
                   "For 'other', the user must specify weights — methodology requires explicit choice.",
        )

    try:
        service = PeerScorecardService()
        return service.compute(tickers, industry_profile)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating peer scorecard: {str(e)}",
        )


@router.post("/benchmark", response_model=Dict[str, Any])
async def generate_benchmark(
    request: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Industry benchmark: per-ticker ratios + SIC/industry tags, ready for
    a long-form ticker × metric table. The industry average is computed on
    the frontend so the user's row-filter checkboxes can recompute it on
    the fly.

    Request body: { tickers: [str, ...], report_type: "10-K"|"10-Q", period: "2024" }
    """
    user_service = UserService(db)
    usage = user_service.check_api_usage_limit(cast(int, current_user.id))
    if usage["exceeded"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"API usage limit exceeded. Used: {usage['current_usage']}/{usage['limit']}",
        )

    tickers = [t.strip().upper() for t in (request.get("tickers") or []) if isinstance(t, str) and t.strip()]
    report_type = request.get("report_type") or "10-K"
    period = request.get("period")

    if len(tickers) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 tickers are required for an industry benchmark.",
        )
    if not period:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A period is required (e.g. '2024' for 10-K, 'Q2 2024' for 10-Q).",
        )

    sec_service = SECService()
    ratio_calculator = FinancialRatioCalculator()
    from services.filer_schema import detect_filer_schema

    rows: List[Dict[str, Any]] = []
    industries_seen: Dict[str, int] = {}
    for ticker in tickers:
        match = None
        for comp in sec_service.search_companies(ticker) or []:
            if comp.get("ticker", "").upper() == ticker:
                match = comp
                break
        if not match:
            rows.append({
                "ticker": ticker,
                "company_name": None,
                "sic": None,
                "industry": None,
                "sector": None,
                "ratios": {},
                "error": "not_found_in_edgar",
            })
            continue

        financial = sec_service.get_financial_statements(match["cik"], report_type, period)
        if not financial or not financial.get("income_statement"):
            rows.append({
                "ticker": ticker,
                "company_name": match.get("company_name"),
                "sic": match.get("sic"),
                "industry": match.get("industry"),
                "sector": match.get("sector"),
                "ratios": {},
                "error": "no_financials_for_period",
            })
            continue

        is_ = financial.get("income_statement") or {}
        bs = financial.get("balance_sheet") or {}
        cf = financial.get("cash_flow") or {}
        schema = detect_filer_schema(is_.keys(), bs.keys())
        values = ratio_calculator._extract_key_values(is_, bs, cf, user_inputs={})
        ratios = ratio_calculator._calculate_ratios(values, schema=schema)

        industry = match.get("industry") or ""
        if industry:
            industries_seen[industry] = industries_seen.get(industry, 0) + 1

        rows.append({
            "ticker": ticker,
            "company_name": match.get("company_name"),
            "sic": match.get("sic"),
            "industry": industry,
            "sector": match.get("sector"),
            "schema": schema,
            "ratios": ratios,
        })

    dominant_industry = max(industries_seen.items(), key=lambda kv: kv[1])[0] if industries_seen else None
    return {
        "tickers": rows,
        "industry_summary": {
            "dominant_industry": dominant_industry,
            "industries_present": industries_seen,
        },
        "report_type": report_type,
        "period": period,
    }


# ============================================================================
# Screener (industry-wide benchmark)
# ============================================================================

from sqlalchemy import select as _sql_select, func as _sql_func, and_ as _sql_and, asc as _sql_asc, desc as _sql_desc
from models.screener import TickerUniverse, RatioCache, IndustryAverage, SectorAverage

# Whitelist of metrics the cache holds — also the columns the UI can sort by.
_SCREENER_METRICS = [
    "gross_profit_margin", "operating_margin", "net_margin", "ebitda_margin",
    "roe", "roa", "roic", "current_ratio", "quick_ratio", "debt_to_equity",
    "interest_coverage", "inventory_turnover", "sga_percent_of_revenue",
]
_SORTABLE_NON_METRICS = {"ticker", "company_name", "exchange", "industry", "sector"}


@router.get("/screener", response_model=Dict[str, Any])
async def screener(
    exchange: str = "NYSE",
    sector: Optional[str] = None,
    industry: Optional[str] = None,
    report_type: str = "10-K",
    period: Optional[str] = None,
    sort_by: str = "ticker",
    sort_dir: str = "asc",  # 'asc' | 'desc'
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Paginated industry-wide screener. Reads from the precomputed cache —
    no live EDGAR calls. Refresh via /admin/refresh-screener-cache.

    Query params:
      exchange   — 'NYSE' | 'Nasdaq' | 'OTC' | 'CBOE'. Defaults to NYSE.
      sector     — optional SIC-Major-Group sector name (e.g. 'Depository Institutions').
      industry   — optional finer-grained industry name.
      report_type, period — defaults to latest cached 10-K.
      sort_by    — 'ticker', 'company_name', 'exchange', 'industry', 'sector',
                    or any metric_key from the cached list.
      sort_dir   — 'asc' | 'desc'.
      page, page_size — 1-indexed; page_size capped at 200.

    Response shape:
      {
        rows: [{ ticker, company_name, exchange, sic, industry, sector,
                 ratios: { metric_key: value, ... } }],
        pagination: { page, page_size, total },
        averages: {
          by_industry: { industry_name: { metric_key: {mean, median, n}, ... } },
          by_sector:   { sector_name:   { metric_key: {mean, median, n}, ... } },
        },
        metrics: [...],
        freshness: { universe, ratios }  # most-recent refresh timestamps
      }
    """
    if period is None and report_type == "10-K":
        period = str(datetime.now(timezone.utc).year - 1)
    page = max(1, page)
    page_size = max(1, min(200, page_size))

    if sort_by not in _SORTABLE_NON_METRICS and sort_by not in _SCREENER_METRICS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"sort_by must be one of {sorted(_SORTABLE_NON_METRICS) + _SCREENER_METRICS}",
        )

    # ----- Base universe query -----
    # Industry filter comes in as a display name (e.g. "Home Builders").
    # Expand to the set of raw SIC names that map to it so the IN-clause
    # matches the rows actually stored under the old SIC labels.
    from services.sic_sectors import display_industry as _display_industry, raw_industries_for_display
    industry_raw_names: list[str] = []
    if industry:
        industry_raw_names = raw_industries_for_display(industry)

    base_q = _sql_select(TickerUniverse).where(TickerUniverse.exchange == exchange)
    if sector:
        base_q = base_q.where(TickerUniverse.sector == sector)
    if industry_raw_names:
        base_q = base_q.where(TickerUniverse.industry.in_(industry_raw_names))

    # ----- Total count for pagination -----
    count_q = _sql_select(_sql_func.count()).select_from(base_q.subquery())
    total = db.execute(count_q).scalar_one()

    # ----- Sort + page -----
    if sort_by in _SORTABLE_NON_METRICS:
        col = getattr(TickerUniverse, "company_name" if sort_by == "company_name" else sort_by)
        order = _sql_desc(col) if sort_dir == "desc" else _sql_asc(col)
        rows_q = base_q.order_by(order).offset((page - 1) * page_size).limit(page_size)
        universe_rows = db.execute(rows_q).scalars().all()
    else:
        # Sort by a metric: outer-join to ratio_cache row for this metric, sort on value.
        rc = RatioCache
        metric_q = (
            _sql_select(TickerUniverse, rc.value)
            .join(rc, _sql_and(
                rc.cik == TickerUniverse.cik,
                rc.report_type == report_type,
                rc.period == period,
                rc.metric_key == sort_by,
            ), isouter=True)
            .where(TickerUniverse.exchange == exchange)
        )
        if sector:
            metric_q = metric_q.where(TickerUniverse.sector == sector)
        if industry_raw_names:
            metric_q = metric_q.where(TickerUniverse.industry.in_(industry_raw_names))
        # Postgres sorts NULLs last by default ASC, first DESC; force NULLs last either way
        order = _sql_desc(rc.value) if sort_dir == "desc" else _sql_asc(rc.value)
        metric_q = metric_q.order_by(order.nulls_last()).offset((page - 1) * page_size).limit(page_size)
        universe_rows = [tup[0] for tup in db.execute(metric_q).all()]

    if not universe_rows:
        return {
            "rows": [], "pagination": {"page": page, "page_size": page_size, "total": total},
            "averages": {"by_industry": {}, "by_sector": {}},
            "metrics": _SCREENER_METRICS,
            "freshness": _freshness(db),
        }

    # ----- Pull cached ratios for the page rows -----
    ciks = [u.cik for u in universe_rows]
    rc_rows = db.execute(
        _sql_select(RatioCache.cik, RatioCache.metric_key, RatioCache.value)
        .where(_sql_and(
            RatioCache.cik.in_(ciks),
            RatioCache.report_type == report_type,
            RatioCache.period == period,
        ))
    ).all()
    ratios_by_cik: Dict[str, Dict[str, Any]] = {}
    for cik, metric_key, value in rc_rows:
        ratios_by_cik.setdefault(cik, {})[metric_key] = value

    # Translate each row's raw SIC industry into the modern display name.
    rows_payload = [
        {
            "ticker": u.ticker,
            "company_name": u.company_name,
            "exchange": u.exchange,
            "sic": u.sic,
            "industry": _display_industry(u.industry),
            "sector": u.sector,
            "ratios": ratios_by_cik.get(u.cik, {}),
        }
        for u in universe_rows
    ]

    # ----- Industry + sector averages for the page's groups -----
    # Averages table is keyed by raw SIC industry name (that's what was stored
    # when refresh_averages ran). Fetch by raw names but expose the results
    # keyed by the display name so the frontend's lookup
    # `data.averages.by_industry[row.industry]` matches the translated
    # row.industry above.
    page_industries_raw = {u.industry for u in universe_rows if u.industry}
    page_sectors = {u.sector for u in universe_rows if u.sector}

    industry_avgs: Dict[str, Dict[str, Dict[str, Any]]] = {}
    if page_industries_raw:
        avg_rows = db.execute(
            _sql_select(IndustryAverage)
            .where(_sql_and(
                IndustryAverage.industry.in_(page_industries_raw),
                IndustryAverage.report_type == report_type,
                IndustryAverage.period == period,
            ))
        ).scalars().all()
        # Multiple raw industries can collapse to one display name. When that
        # happens, merge the buckets by sample-size-weighted mean.
        merge_buf: Dict[str, Dict[str, list[tuple[float, float, int]]]] = {}
        for a in avg_rows:
            display = _display_industry(a.industry)
            merge_buf.setdefault(display, {}).setdefault(a.metric_key, []).append(
                (a.mean, a.median, a.n)
            )
        for display, by_metric in merge_buf.items():
            for metric_key, entries in by_metric.items():
                total_n = sum(n for _, _, n in entries) or 1
                weighted_mean = sum((m or 0) * n for m, _, n in entries) / total_n
                # Median across merged buckets isn't well-defined without
                # raw samples; expose the largest bucket's median as a
                # best-effort proxy.
                biggest = max(entries, key=lambda e: e[2])
                industry_avgs.setdefault(display, {})[metric_key] = {
                    "mean": weighted_mean, "median": biggest[1], "n": total_n,
                }

    sector_avgs: Dict[str, Dict[str, Dict[str, Any]]] = {}
    if page_sectors:
        avg_rows = db.execute(
            _sql_select(SectorAverage)
            .where(_sql_and(
                SectorAverage.sector.in_(page_sectors),
                SectorAverage.report_type == report_type,
                SectorAverage.period == period,
            ))
        ).scalars().all()
        for a in avg_rows:
            sector_avgs.setdefault(a.sector, {})[a.metric_key] = {
                "mean": a.mean, "median": a.median, "n": a.n,
            }

    return {
        "rows": rows_payload,
        "pagination": {"page": page, "page_size": page_size, "total": total},
        "averages": {"by_industry": industry_avgs, "by_sector": sector_avgs},
        "metrics": _SCREENER_METRICS,
        "filters": {"exchange": exchange, "sector": sector, "industry": industry,
                    "report_type": report_type, "period": period,
                    "sort_by": sort_by, "sort_dir": sort_dir},
        "freshness": _freshness(db),
    }


def _freshness(db: Session) -> Dict[str, Optional[str]]:
    """Return ISO timestamps of the most-recently refreshed universe row and
    ratio_cache row. UI uses these to show 'data as of …'."""
    u = db.execute(_sql_select(_sql_func.max(TickerUniverse.refreshed_at))).scalar_one_or_none()
    r = db.execute(_sql_select(_sql_func.max(RatioCache.refreshed_at))).scalar_one_or_none()
    return {
        "universe": u.isoformat() if u else None,
        "ratios": r.isoformat() if r else None,
    }


@router.get("/screener/options", response_model=Dict[str, Any])
async def screener_options(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Distinct values available for the screener filters (populated from the
    cache). Lets the UI build dropdowns without hardcoding."""
    from services.sic_sectors import display_industry
    exchanges = [r[0] for r in db.execute(
        _sql_select(TickerUniverse.exchange).distinct().where(TickerUniverse.exchange.isnot(None))
    ).all() if r[0]]
    sectors = [r[0] for r in db.execute(
        _sql_select(TickerUniverse.sector).distinct().where(TickerUniverse.sector.isnot(None))
    ).all() if r[0]]
    # Translate raw SIC industry names → modern display labels; dedupe
    # (multiple raw names can map to the same display name, e.g. both
    # "Operative Builders" and "General Bldg Contractors - Residential
    # Bldgs" → "Home Builders").
    industries_raw = [r[0] for r in db.execute(
        _sql_select(TickerUniverse.industry).distinct().where(TickerUniverse.industry.isnot(None))
    ).all() if r[0]]
    industries = sorted({display_industry(i) for i in industries_raw if i})
    return {
        "exchanges": sorted(exchanges),
        "sectors": sorted(sectors),
        "industries": industries,
        "metrics": _SCREENER_METRICS,
        "freshness": _freshness(db),
    }


@router.post("/admin/refresh-screener-cache", response_model=Dict[str, Any])
async def refresh_screener_cache(
    request: dict,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Trigger a screener-cache refresh.

    Body:
      stage: 'universe' | 'ratios' | 'averages' | 'all' (default 'all')
      exchanges: optional list (e.g. ['NYSE', 'Nasdaq']) to scope ratios
      limit: optional int cap on ratio refresh (useful for first build / dev)
      report_type, period: defaults to last completed 10-K

    Runs in background. Returns immediately with {accepted: true}.
    """
    stage = (request.get("stage") or "all").lower()
    exchanges = request.get("exchanges")
    limit = request.get("limit")
    report_type = request.get("report_type") or "10-K"
    period = request.get("period")

    force = bool(request.get("force", False))

    def _run() -> None:
        from database import SessionLocal as _SL
        bg_db = _SL()
        try:
            if stage in ("universe", "all"):
                screener_cache.refresh_universe(bg_db)
            if stage in ("enrich", "enrichment", "all"):
                screener_cache.enrich_universe(
                    bg_db, exchanges=exchanges, limit=limit, force=force,
                )
            if stage in ("ratios", "all"):
                screener_cache.refresh_ratios(
                    bg_db, report_type=report_type, period=period,
                    exchanges=exchanges, limit=limit,
                )
            if stage in ("averages", "all"):
                screener_cache.refresh_averages(bg_db, report_type=report_type, period=period)
        finally:
            bg_db.close()

    background_tasks.add_task(_run)
    return {"accepted": True, "stage": stage}


# ============================================================================
# Parametric routes — declared LAST so literal-path routes match first
# ============================================================================

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


@router.get("/{analysis_id}/ratios", response_model=Dict[str, Any])
async def get_financial_ratios(
    analysis_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get calculated financial ratios for a specific analysis"""
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user.id
    ).first()
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )
    financial_report = analysis.financial_report
    if not financial_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Financial report not found"
        )
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