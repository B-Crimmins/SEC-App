from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


class FinancialRatioCalculator:
    """Calculate financial ratios from SEC financial data"""
    
    def __init__(self):
        self.ratio_definitions = {
            'revenue': {'label': 'Revenue', 'unit': '$M', 'category': 'Income Statement'},
            'gross_profit_margin': {'label': 'Gross Profit Margin', 'unit': '%', 'category': 'Profitability'},
            'operating_margin': {'label': 'Operating Margin', 'unit': '%', 'category': 'Profitability'},
            'net_margin': {'label': 'Net Margin', 'unit': '%', 'category': 'Profitability'},
            'ebitda_margin': {'label': 'EBITDA Margin', 'unit': '%', 'category': 'Profitability'},
            'current_ratio': {'label': 'Current Ratio', 'unit': '', 'category': 'Liquidity'},
            'quick_ratio': {'label': 'Quick Ratio', 'unit': '', 'category': 'Liquidity'},
            'cash_ratio': {'label': 'Cash Ratio', 'unit': '', 'category': 'Liquidity'},
            'debt_to_equity': {'label': 'Debt to Equity', 'unit': '', 'category': 'Leverage'},
            'debt_to_total_capitalization': {'label': 'Debt to Total Capitalization', 'unit': '', 'category': 'Leverage'},
            'total_assets_to_equity': {'label': 'Total Assets/Equity', 'unit': '', 'category': 'Leverage'},
            'roe': {'label': 'Return on Equity (ROE)', 'unit': '%', 'category': 'Profitability'},
            'roa': {'label': 'Return on Assets (ROA)', 'unit': '%', 'category': 'Profitability'},
            'roic': {'label': 'Return on Invested Capital (ROIC)', 'unit': '%', 'category': 'Profitability'},
            'interest_coverage': {'label': 'Interest Coverage Ratio', 'unit': '', 'category': 'Leverage'},
            'inventory_turnover': {'label': 'Inventory Turnover', 'unit': 'x', 'category': 'Efficiency'},
            'receivables_ratio': {'label': 'Receivables Ratio', 'unit': '', 'category': 'Efficiency'},
            'operating_cash_flow_to_net_income': {'label': 'Operating Cash Flow/Net Income', 'unit': '', 'category': 'Cash Flow'},
            'capex_to_depreciation': {'label': 'Capex/Depreciation', 'unit': '', 'category': 'Cash Flow'},
            'book_value': {'label': 'Book Value', 'unit': '$', 'category': 'Valuation'},
            'tangible_book_value': {'label': 'Tangible Book Value', 'unit': '$', 'category': 'Valuation'},
            'net_working_capital_ratio': {'label': 'Net Working Capital Ratio', 'unit': '', 'category': 'Liquidity'},
            'earnings_per_share': {'label': 'Earnings Per Share', 'unit': '$', 'category': 'Profitability'}
        }
    
    def calculate_single_company_ratios(self, financial_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate ratios for a single company"""
        try:
            income_statement = financial_data.get('income_statement', {})
            balance_sheet = financial_data.get('balance_sheet', {})
            cash_flow = financial_data.get('cash_flow', {})
            
            # Extract key values
            extracted_values = self._extract_key_values(income_statement, balance_sheet, cash_flow)
            
            # Calculate ratios
            calculated_ratios = self._calculate_ratios(extracted_values)
            
            return {
                'ratios': calculated_ratios,
                'raw_values': extracted_values,
                'calculation_metadata': {
                    'total_ratios_calculated': len(calculated_ratios),
                    'data_quality': self._assess_data_quality(extracted_values)
                }
            }
            
        except Exception as e:
            logger.error(f"Error calculating ratios: {e}")
            return {'error': str(e)}
    
    def calculate_peer_group_ratios(self, peer_group_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate ratios for multiple companies in a peer group"""
        try:
            peer_ratios = {}
            
            for ticker, company_data in peer_group_data.items():
                if 'periods' in company_data:
                    # Handle multiple periods
                    period_ratios = {}
                    for period, period_data in company_data['periods'].items():
                        period_ratios[period] = self.calculate_single_company_ratios(period_data)
                    peer_ratios[ticker] = {
                        'company_name': company_data.get('company_name', ticker),
                        'periods': period_ratios
                    }
                else:
                    # Single period data
                    peer_ratios[ticker] = {
                        'company_name': company_data.get('company_name', ticker),
                        'ratios': self.calculate_single_company_ratios(company_data)
                    }
            
            return {
                'peer_group_ratios': peer_ratios,
                'summary': {
                    'total_companies': len(peer_ratios),
                    'companies_with_data': len([c for c in peer_ratios.values() if 'error' not in c])
                }
            }
            
        except Exception as e:
            logger.error(f"Error calculating peer group ratios: {e}")
            return {'error': str(e)}
    
    def _extract_key_values(self, income_statement: Dict, balance_sheet: Dict, cash_flow: Dict) -> Dict[str, float]:
        """Extract key financial values from SEC data"""
        values = {}
        
        print(f"🔍 DEBUG: Extracting values from SEC data")
        print(f"📊 Income Statement keys: {list(income_statement.keys())[:10]}...")
        print(f"📊 Balance Sheet keys: {list(balance_sheet.keys())[:10]}...")
        print(f"📊 Cash Flow keys: {list(cash_flow.keys())[:10]}...")
        
        # Income Statement Values
        values['revenue'] = self._find_value_by_keywords(income_statement, [
            'us-gaap.Revenues', 'us-gaap.SalesRevenueNet', 'us-gaap.RevenueFromContractWithCustomerExcludingAssessedTax'
        ])
        values['gross_profit'] = self._find_value_by_keywords(income_statement, [
            'us-gaap.GrossProfit'
        ])
        values['operating_income'] = self._find_value_by_keywords(income_statement, [
            'us-gaap.OperatingIncomeLoss'
        ])
        values['net_income'] = self._find_value_by_keywords(income_statement, [
            'us-gaap.NetIncomeLoss'
        ])
        values['cost_of_goods_sold'] = self._find_value_by_keywords(income_statement, [
            'us-gaap.CostOfGoodsAndServicesSold', 'us-gaap.CostOfRevenue'
        ])
        values['depreciation_amortization'] = self._find_value_by_keywords(income_statement, [
            'us-gaap.DepreciationAndAmortization'
        ])
        values['interest_expense'] = self._find_value_by_keywords(income_statement, [
            'us-gaap.InterestExpense'
        ])
        values['shares_outstanding'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.CommonStockSharesOutstanding', 'us-gaap.EntityCommonStockSharesOutstanding',
            'us-gaap.CommonStockSharesIssued', 'us-gaap.CommonStockSharesAuthorized'
        ])
        
        # Balance Sheet Values
        values['total_assets'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.Assets'
        ])
        values['current_assets'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.AssetsCurrent'
        ])
        values['total_liabilities'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.Liabilities'
        ])
        values['current_liabilities'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.LiabilitiesCurrent'
        ])
        values['total_equity'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.StockholdersEquity'
        ])
        values['cash'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.CashAndCashEquivalentsAtCarryingValue', 'us-gaap.CashAndCashEquivalents'
        ])
        values['inventory'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.InventoryNet'
        ])
        values['accounts_receivable'] = self._find_value_by_keywords(balance_sheet, [
            'us-gaap.AccountsReceivableNetCurrent'
        ])
        
        # Cash Flow Values
        values['operating_cash_flow'] = self._find_value_by_keywords(cash_flow, [
            'us-gaap.NetCashProvidedByUsedInOperatingActivities'
        ])
        values['capex'] = self._find_value_by_keywords(cash_flow, [
            'us-gaap.PaymentsToAcquirePropertyPlantAndEquipment'
        ])
        
        # Log extracted values for debugging
        print(f"🔍 EXTRACTED VALUES:")
        for key, value in values.items():
            print(f"  {key}: {value:,.0f}")
        
        return values
    
    def _find_value_by_keywords(self, statement_data: Dict, keywords: List[str]) -> float:
        """Find a value by trying multiple possible keys"""
        for keyword in keywords:
            if keyword in statement_data:
                value_data = statement_data[keyword]
                print(f"🔍 Found {keyword}: {value_data}")
                if isinstance(value_data, dict) and 'value' in value_data:
                    value = value_data['value']
                    if value is not None:
                        print(f"✅ Extracted {keyword}: {value}")
                        return float(value)
                else:
                    print(f"⚠️ {keyword} found but no 'value' field: {type(value_data)}")
            else:
                print(f"❌ {keyword} not found in statement data")
        return 0.0
    
    def _calculate_ratios(self, values: Dict[str, float]) -> Dict[str, Dict[str, Any]]:
        """Calculate financial ratios from extracted values"""
        ratios = {}
        
        # Revenue (raw value in millions)
        if values['revenue'] > 0:
            ratios['revenue'] = self._create_ratio_result(values['revenue'], 'Revenue')
        
        # Gross Profit Margin = (Gross Profit / Revenue) * 100
        if values['revenue'] > 0 and values['gross_profit'] > 0:
            gross_margin = (values['gross_profit'] / values['revenue']) * 100
            print(f"🧮 Gross Profit Margin calculation: {values['gross_profit']:,.0f} / {values['revenue']:,.0f} * 100 = {gross_margin:.2f}%")
            ratios['gross_profit_margin'] = self._create_ratio_result(gross_margin, 'Gross Profit Margin')
        else:
            print(f"⚠️ Cannot calculate Gross Profit Margin: revenue={values['revenue']:,.0f}, gross_profit={values['gross_profit']:,.0f}")
        
        # Operating Margin = (Operating Income / Revenue) * 100
        if values['revenue'] > 0 and values['operating_income'] != 0:
            operating_margin = (values['operating_income'] / values['revenue']) * 100
            ratios['operating_margin'] = self._create_ratio_result(operating_margin, 'Operating Margin')
        
        # Net Margin = (Net Income / Revenue) * 100
        if values['revenue'] > 0 and values['net_income'] != 0:
            net_margin = (values['net_income'] / values['revenue']) * 100
            ratios['net_margin'] = self._create_ratio_result(net_margin, 'Net Margin')
        
        # EBITDA Margin = (EBITDA / Revenue) * 100
        ebitda = values['operating_income'] + values['depreciation_amortization']
        if values['revenue'] > 0 and ebitda != 0:
            ebitda_margin = (ebitda / values['revenue']) * 100
            ratios['ebitda_margin'] = self._create_ratio_result(ebitda_margin, 'EBITDA Margin')
        
        # Current Ratio = Current Assets / Current Liabilities
        if values['current_liabilities'] > 0:
            current_ratio = values['current_assets'] / values['current_liabilities']
            ratios['current_ratio'] = self._create_ratio_result(current_ratio, 'Current Ratio')
        
        # Quick Ratio = (Current Assets - Inventory) / Current Liabilities
        if values['current_liabilities'] > 0:
            quick_ratio = (values['current_assets'] - values['inventory']) / values['current_liabilities']
            ratios['quick_ratio'] = self._create_ratio_result(quick_ratio, 'Quick Ratio')
        
        # Cash Ratio = Cash / Current Liabilities
        if values['current_liabilities'] > 0:
            cash_ratio = values['cash'] / values['current_liabilities']
            ratios['cash_ratio'] = self._create_ratio_result(cash_ratio, 'Cash Ratio')
        
        # Debt to Equity = Total Liabilities / Total Equity
        if values['total_equity'] > 0:
            debt_to_equity = values['total_liabilities'] / values['total_equity']
            ratios['debt_to_equity'] = self._create_ratio_result(debt_to_equity, 'Debt to Equity')
        
        # Debt to Total Capitalization = Total Liabilities / (Total Liabilities + Total Equity)
        total_capitalization = values['total_liabilities'] + values['total_equity']
        if total_capitalization > 0:
            debt_to_cap = values['total_liabilities'] / total_capitalization
            ratios['debt_to_total_capitalization'] = self._create_ratio_result(debt_to_cap, 'Debt to Total Capitalization')
        
        # Total Assets to Equity = Total Assets / Total Equity
        if values['total_equity'] > 0:
            assets_to_equity = values['total_assets'] / values['total_equity']
            ratios['total_assets_to_equity'] = self._create_ratio_result(assets_to_equity, 'Total Assets/Equity')
        
        # ROE = (Net Income / Total Equity) * 100
        if values['total_equity'] > 0 and values['net_income'] != 0:
            roe = (values['net_income'] / values['total_equity']) * 100
            ratios['roe'] = self._create_ratio_result(roe, 'Return on Equity (ROE)')
        
        # ROA = (Net Income / Total Assets) * 100
        if values['total_assets'] > 0 and values['net_income'] != 0:
            roa = (values['net_income'] / values['total_assets']) * 100
            ratios['roa'] = self._create_ratio_result(roa, 'Return on Assets (ROA)')
        
        # ROIC = Net Income / (Total Assets - Current Liabilities) * 100
        invested_capital = values['total_assets'] - values['current_liabilities']
        if invested_capital > 0 and values['net_income'] != 0:
            roic = (values['net_income'] / invested_capital) * 100
            ratios['roic'] = self._create_ratio_result(roic, 'Return on Invested Capital (ROIC)')
        
        # Interest Coverage = Operating Income / Interest Expense
        if values['interest_expense'] > 0:
            interest_coverage = values['operating_income'] / values['interest_expense']
            ratios['interest_coverage'] = self._create_ratio_result(interest_coverage, 'Interest Coverage Ratio')
        
        # Inventory Turnover = Cost of Goods Sold / Inventory
        if values['inventory'] > 0:
            inventory_turnover = values['cost_of_goods_sold'] / values['inventory']
            ratios['inventory_turnover'] = self._create_ratio_result(inventory_turnover, 'Inventory Turnover')
        
        # Receivables Ratio = Accounts Receivable / Revenue
        if values['revenue'] > 0:
            receivables_ratio = values['accounts_receivable'] / values['revenue']
            ratios['receivables_ratio'] = self._create_ratio_result(receivables_ratio, 'Receivables Ratio')
        
        # Operating Cash Flow to Net Income = Operating Cash Flow / Net Income
        if values['net_income'] != 0:
            ocf_to_net_income = values['operating_cash_flow'] / values['net_income']
            ratios['operating_cash_flow_to_net_income'] = self._create_ratio_result(ocf_to_net_income, 'Operating Cash Flow/Net Income')
        
        # Capex to Depreciation = Capital Expenditures / Depreciation
        if values['depreciation_amortization'] > 0:
            capex_to_depreciation = values['capex'] / values['depreciation_amortization']
            ratios['capex_to_depreciation'] = self._create_ratio_result(capex_to_depreciation, 'Capex/Depreciation')
        
        # Book Value = Total Equity (in millions)
        if values['total_equity'] > 0:
            book_value = values['total_equity'] / 1000000
            ratios['book_value'] = self._create_ratio_result(book_value, 'Book Value')
        
        # Tangible Book Value = Total Equity (simplified, in millions)
        if values['total_equity'] > 0:
            tangible_book_value = values['total_equity'] / 1000000
            ratios['tangible_book_value'] = self._create_ratio_result(tangible_book_value, 'Tangible Book Value')
        
        # Net Working Capital Ratio = (Current Assets - Current Liabilities) / Total Assets
        if values['total_assets'] > 0:
            net_working_capital_ratio = (values['current_assets'] - values['current_liabilities']) / values['total_assets']
            ratios['net_working_capital_ratio'] = self._create_ratio_result(net_working_capital_ratio, 'Net Working Capital Ratio')
        
        # Earnings Per Share = Net Income / Shares Outstanding
        if values['shares_outstanding'] > 0 and values['net_income'] != 0:
            eps = values['net_income'] / values['shares_outstanding']
            print(f"🧮 EPS calculation: {values['net_income']:,.0f} / {values['shares_outstanding']:,.0f} = {eps:.2f}")
            ratios['earnings_per_share'] = self._create_ratio_result(eps, 'Earnings Per Share')
        else:
            print(f"⚠️ Cannot calculate EPS: shares_outstanding={values['shares_outstanding']:,.0f}, net_income={values['net_income']:,.0f}")
        
        return ratios
    
    def _create_ratio_result(self, value: float, label: str) -> Dict[str, Any]:
        """Create a standardized ratio result"""
        return {
            'value': round(value, 2),
            'label': label,
            'formatted': self._format_ratio_value(value, label)
        }
    
    def _format_ratio_value(self, value: float, label: str) -> str:
        """Format ratio value for display"""
        if 'Margin' in label or 'ROE' in label or 'ROA' in label or 'ROIC' in label:
            return f"{value:.2f}%"
        elif 'Ratio' in label or 'Turnover' in label:
            return f"{value:.2f}x"
        elif 'Per Share' in label or 'Book Value' in label:
            return f"${value:.2f}"
        elif 'Revenue' in label:
            return f"${value:.2f}M"
        else:
            return f"{value:.2f}"
    
    def _assess_data_quality(self, values: Dict[str, float]) -> Dict[str, Any]:
        """Assess the quality of extracted financial data"""
        non_zero_values = sum(1 for v in values.values() if v > 0)
        total_values = len(values)
        
        return {
            'completeness': round((non_zero_values / total_values) * 100, 1),
            'non_zero_values': non_zero_values,
            'total_values': total_values,
            'quality_score': 'Good' if non_zero_values / total_values > 0.5 else 'Poor'
        } 