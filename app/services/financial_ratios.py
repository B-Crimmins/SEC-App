import re
from typing import Dict, Any, List, Optional, Tuple
import logging

from sqlalchemy import values
from scipy.optimize import brentq

from services.ratio_tooltips import RATIO_SPECS, build_tooltips_for_series

logger = logging.getLogger(__name__)


class FinancialRatioCalculator:
    """Calculate financial ratios from SEC financial data"""
    
    def __init__(self):
        self.ratio_definitions = {
            'revenue': {'label': 'Revenue', 'unit': '$M', 'category': 'Income Statement'},
            'gross_profit_margin': {'label': 'Gross Profit Margin', 'unit': '%', 'category': 'Profitability'},
            'operating_margin': {'label': 'Operating Margin', 'unit': '%', 'category': 'Profitability'},
            'net_margin': {'label': 'Net Margin', 'unit': '%', 'category': 'Profitability'},
            'pre_tax_margin': {'label': 'Pre-Tax Margin', 'unit': '%', 'category': 'Profitability'},
            'ebitda_margin': {'label': 'EBITDA Margin', 'unit': '%', 'category': 'Profitability'},
            'current_ratio': {'label': 'Current Ratio', 'unit': '', 'category': 'Liquidity'},
            'quick_ratio': {'label': 'Quick Ratio', 'unit': '', 'category': 'Liquidity'},
            'cash_ratio': {'label': 'Cash Ratio', 'unit': '', 'category': 'Liquidity'},
            'debt_to_equity': {'label': 'Debt to Equity', 'unit': '', 'category': 'Capital'},
            'debt_to_total_capitalization': {'label': 'Debt to Total Capitalization', 'unit': '', 'category': 'Capital'},
            'total_assets_to_equity': {'label': 'Total Assets/Equity', 'unit': '', 'category': 'Capital'},
            'average age of plant': {'label': 'Average Age of Plant', 'unit': '', 'category': 'Capital'},
            'average remaining life of plant': {'label': 'Average Remaining Life of Plant', 'unit': '', 'category': 'Capital'},
            'average total life span of plant': {'label': 'Average Total Life Span of Plant', 'unit': '', 'category': 'Capital'},
            'roe': {'label': 'Return on Equity', 'unit': '%', 'category': 'Profitability'},
            'roa': {'label': 'Return on Assets', 'unit': '%', 'category': 'Profitability'},
            'roic': {'label': 'Return on Invested Capital', 'unit': '%', 'category': 'Profitability'},
            'interest_coverage': {'label': 'Interest Coverage Ratio', 'unit': '', 'category': 'Leverage'},
            'inventory_turnover': {'label': 'Inventory Turnover', 'unit': '', 'category': 'Operating'},
            'days_payable_outstanding': {'label': 'Days Payable Outstanding', 'unit': '', 'category': 'Operating'},
            'ccc': {'label': 'Cash Conversion Cycle', 'unit': '', 'category': 'Operating'},
            'receivables_turnover': {'label': 'Receivables Turnover', 'unit': '', 'category': 'Operating'},
            'operating_cash_flow_to_net_income': {'label': 'Operating Cash Flow/Net Income', 'unit': '', 'category': 'Earnings Quality'},
            'capex_to_depreciation': {'label': 'Capex/Depreciation', 'unit': '', 'category': 'Earnings Quality'},
            'book_value': {'label': 'Book Value', 'unit': '$', 'category': 'Capital'},
            'tangible_book_value': {'label': 'Tangible Book Value', 'unit': '$', 'category': 'Capital'},
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

            # Detect the filer's income-statement schema so ratios that come
            # up blank for structural reasons (airlines/banks/REITs/insurers)
            # can carry a tooltip-friendly explanation instead of just being
            # dropped silently.
            from services.filer_schema import detect_filer_schema
            schema = detect_filer_schema(income_statement.keys(), balance_sheet.keys())

            # Calculate ratios
            calculated_ratios = self._calculate_ratios(extracted_values, schema=schema)
            
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
                    self._attach_tooltips_to_series(period_ratios)
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

    def _attach_tooltips_to_series(self, period_ratios: Dict[str, Dict[str, Any]]) -> None:
        """Attach tooltip metadata + YoY driver info onto each ratio per period.

        Periods are sorted chronologically; the earliest shows formula only,
        each later period compares against its immediate predecessor.
        """
        if not period_ratios:
            return

        periods_sorted = sorted(period_ratios.keys())
        values_by_period = {
            period: period_ratios[period].get('raw_values') or {}
            for period in periods_sorted
        }

        for ratio_key in RATIO_SPECS.keys():
            tooltips = build_tooltips_for_series(ratio_key, periods_sorted, values_by_period)
            for period, tooltip in tooltips.items():
                ratios = period_ratios.get(period, {}).get('ratios') or {}
                ratio_result = ratios.get(ratio_key)
                if isinstance(ratio_result, dict):
                    ratio_result['tooltip'] = tooltip

    # -------- Keyword based searches need to be scrapped; Use "standard concept" from edgartools instead ----------

    def _extract_key_values(self, income_statement: Dict, balance_sheet: Dict, cash_flow: Dict, user_inputs: Dict = None) -> Dict[str, float]:
        """Extract key financial values from SEC data"""
        values = {}
        user_inputs = user_inputs or {}
        print(f"🔍 DEBUG: Extracting values from SEC data")
        print(f"📊 Income Statement keys: {list(income_statement.keys())[:10]}...")
        print(f"📊 Balance Sheet keys: {list(balance_sheet.keys())[:10]}...")
        print(f"📊 Cash Flow keys: {list(cash_flow.keys())[:10]}...")

    
        # Income Statement Values
        values['revenue'] = self._find_value_by_keywords(income_statement, [
            'Revenues',
            'Revenue',
            'SalesRevenueNet',
            'RevenueFromContractWithCustomerExcludingAssessedTax',
            'RevenueFromContractWithCustomerIncludingAssessedTax',
        ])
        values['gross_profit'] = self._find_value_by_keywords(income_statement, [
            'GrossProfit'
        ])
        values['operating_income'] = self._find_value_by_keywords(income_statement, [
            'OperatingIncomeLoss'
        ])
        # Many filers (e.g. Alcoa) don't tag `OperatingIncomeLoss` directly
        # — they roll operating + non-operating into a custom entity-extension
        # like `aa_CostsAndOperatingExpensesAndNonoperatingIncomeExpenses` and
        # only break out pretax income. Derive op-income as `PretaxIncome +
        # InterestExpense` when the standard tag is absent. This is a
        # conservative reconstruction (ignores small non-operating items)
        # but it beats reporting margin as blank when the data is right there.
        if not values['operating_income']:
            pretax = self._find_value_by_keywords(income_statement, ['PretaxIncomeLoss'])
            int_exp = self._find_value_by_keywords(income_statement, ['InterestExpense'])
            if pretax and int_exp:
                values['operating_income'] = pretax + abs(int_exp)
        values['net_income'] = self._find_value_by_keywords(income_statement, [
            'NetIncome',
            # us-gaap actually exposes this as NetIncomeLoss (covers both
            # positive and negative results). When edgartools doesn't
            # normalize the standard_concept to "NetIncome", we still need
            # to pick this row up.
            'NetIncomeLoss',
        ])
        values['cost_of_goods_sold'] = self._find_value_by_keywords(income_statement, [
            'CostOfGoodsAndServicesSold',
            'CostOfRevenue',
            'CostOfGoodsSold',
        ])
        # Manufacturers like Alcoa frequently don't tag `us-gaap:GrossProfit`
        # directly — they only tag Revenues and CostOfGoodsAndServicesSold.
        # Back into gross_profit when the direct lookup misses, otherwise
        # gross_profit_margin renders empty even though both inputs exist.
        if not values['gross_profit'] and values['revenue'] and values['cost_of_goods_sold']:
            values['gross_profit'] = values['revenue'] - values['cost_of_goods_sold']
        values['research_and_developement'] = self._find_value_by_keywords(income_statement, [
            'ResearchAndDevelopmentExpenses'
        ])    
        values['operating_expenses'] = self._find_value_by_keywords(income_statement, [
            'TotalOperatingExpenses'
        ])                                                                       
        values['interest_expense'] = self._find_value_by_keywords(income_statement, [
            'InterestExpense'
        ]) or self._find_value_by_keywords(cash_flow, ['InterestExpense'])
        values['interest_income'] = self._find_value_by_keywords(income_statement, [
            'InterestIncome', 'NetInterestIncome'
        ])
        # Shares outstanding lives in several places depending on the filer
        # and the form. Try balance-sheet outstanding/issued first, then the
        # income statement's weighted-average rows, then the DEI cover-page
        # entity-level fact (sometimes only that one is tagged).
        values['shares_outstanding'] = (
            self._find_value_by_keywords(balance_sheet, [
                'SharesYearEnd', 'SharesIssued',
                'CommonStockSharesOutstanding', 'CommonStockSharesIssued',
                'EntityCommonStockSharesOutstanding',
            ])
            or self._find_value_by_keywords(income_statement, [
                'SharesFullyDilutedAverage', 'SharesAverage',
                'WeightedAverageNumberOfSharesOutstandingBasic',
                'WeightedAverageNumberOfDilutedSharesOutstanding',
            ])
            or self._find_value_by_keywords(cash_flow, [
                'EntityCommonStockSharesOutstanding',
            ])
        )
        values['income_taxes'] = self._find_value_by_keywords(income_statement, [
            'IncomeTaxes',
            # us-gaap canonical name. The shorter "IncomeTaxes" only matches
            # when edgartools normalizes — otherwise we miss tax expense
            # entirely, which kills the effective_tax_rate ratio.
            'IncomeTaxExpenseBenefit',
            'IncomeTaxesPaidNet',
        ])
        # Prefer the filer-reported EPS directly when present — it's already
        # rounded to the filer's stated precision and avoids back-calculating
        # net_income / shares_outstanding (which fails whenever either input
        # is missing).
        values['eps_basic'] = self._find_value_by_keywords(income_statement, [
            'EarningsPerShareBasic',
            'EarningsPerShareBasicAndDiluted',
        ])
        values['sg&a'] = self._find_value_by_keywords(income_statement, [
            'SellingGeneralAndAdminExpenses'
        ])
        values['non_operating_income'] = self._find_value_by_keywords(income_statement, [
            'NonoperatingIncomeExpense'
        ])

        # values['revenue'] = self._find_value_by_keywords(income_statement, [
        #     'us-gaap.Revenues', 'us-gaap.SalesRevenueNet', 'us-gaap.RevenueFromContractWithCustomerExcludingAssessedTax'
        # ])
        # values['gross_profit'] = self._find_value_by_keywords(income_statement, [
        #     'us-gaap.GrossProfit'
        # ])
        # values['operating_income'] = self._find_value_by_keywords(income_statement, [
        #     'us-gaap.OperatingIncomeLoss'
        # ])
        # values['net_income'] = self._find_value_by_keywords(income_statement, [
        #     'us-gaap.NetIncomeLoss'
        # ])
        # values['cost_of_goods_sold'] = self._find_value_by_keywords(income_statement, [
        #     'us-gaap.CostOfGoodsAndServicesSold', 'us-gaap.CostOfRevenue'
        # ])
        # values['depreciation_amortization'] = self._find_value_by_keywords(income_statement, [
        #     'us-gaap.DepreciationAndAmortization'
        # ])
        # values['interest_expense'] = self._find_value_by_keywords(income_statement, [
        #     'us-gaap.InterestExpense'
        # ])
        # values['shares_outstanding'] = self._find_value_by_keywords(balance_sheet, [
        #     'us-gaap.CommonStockSharesOutstanding', 'us-gaap.EntityCommonStockSharesOutstanding',
        #     'us-gaap.CommonStockSharesIssued', 'us-gaap.CommonStockSharesAuthorized'
        # ])
        
        # Balance Sheet Values
        
        values['total_assets'] = self._find_value_by_keywords(balance_sheet, [
            'Assets'
        ])
        values['current_assets'] = self._find_value_by_keywords(balance_sheet, [
            'CurrentAssetsTotal'
        ])
        values['total_liabilities'] = self._find_value_by_keywords(balance_sheet, [
            'Liabilities'
        ])
        values['current_liabilities'] = self._find_value_by_keywords(balance_sheet, [
            'CurrentLiabilitiesTotal'
        ])
        values['long_term_debt'] = self._find_value_by_keywords(balance_sheet, [
            'LongTermDebt', 'LongTermDebtNoncurrent'
        ])
        values['total_equity'] = self._find_value_by_keywords(balance_sheet, [
            'AllEquityBalance',
            'StockholdersEquity',
            # AA-style filings tag total equity (parent + NCI) with this longer
            # us-gaap concept; without it the ratio lookup returns 0 even when
            # the underlying value is present.
            'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
        ])
        values['cash'] = self._find_value_by_keywords(balance_sheet, [
            'CashAndCashEquivalents', 'CashAndMarketableSecurities',
            'CashAndCashEquivalentsAtCarryingValue'
        ])
        values['inventory'] = self._find_value_by_keywords(balance_sheet, [
            'Inventories'
        ])
        values['accounts_receivable'] = self._find_value_by_keywords(balance_sheet, [
            'TradeReceivables'
        ])
        values['deffered_tax_assets'] = self._find_value_by_keywords(balance_sheet, [
            'DeferredTaxNoncurrentAssets'
        ])
        values['PrepaidExpensesAndOtherCurrentAssets'] = self._find_value_by_keywords(balance_sheet, [
            'PrepaidExpensesAndOtherCurrentAssets'
        ])
        values['accumulated_depreciation'] = self._find_value_by_keywords(balance_sheet, [
            'AccumulatedDepreciation',
            # us-gaap canonical name (it's a mouthful). Without this alias,
            # Average Age of Plant goes empty for filers whose
            # standard_concept didn't get shortened.
            'AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment',
        ])
        values['PP&E_net'] = self._find_value_by_keywords(balance_sheet, [
            'PlantPropertyEquipmentNet',
            'PropertyPlantAndEquipmentNet',
        ])
        values['pp&e_gross'] = self._find_value_by_keywords(balance_sheet, [
            'GrossPropertyPlantEquipment',
            'PropertyPlantAndEquipmentGross',
        ])
        # Cash Flow Values
        values['operating_cash_flow'] = self._find_value_by_keywords(cash_flow, [
            'NetCashFromOperatingActivities'
        ])
        values['capex'] = self._find_value_by_keywords(cash_flow, [
            'CapitalExpenses'
        ])

        values['depreciation_amortization'] = self._find_value_by_keywords(cash_flow, [
            'DepreciationDepletionAndAmortization',
            'DepreciationAndAmortization',
            'DepreciationAmortization',
            'DepreciationExpense',
            'OtherDepreciationAndAmortization',
            'Depreciation',
        ])
        values['short_term_investments'] = self._find_value_by_keywords(balance_sheet, [
            'ShortTermInvestments'
        ])
        values['shareholder_equity'] = self._find_value_by_keywords(balance_sheet, [
            'AllEquityBalance',
            'StockholdersEquity',
            'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
        ])
        values['goodwill'] = self._find_value_by_keywords(balance_sheet, [
            'Goodwill'
        ])
        values['preferred_stock'] = self._find_value_by_keywords(balance_sheet, [
            'PreferredStock', 'PreferredStockValue',
            'PreferredStockIncludingAdditionalPaidInCapital'
        ])
        # User Inputs
        values['stock_price'] = user_inputs.get('stock_price')
        values['company_beta'] = user_inputs.get('company_beta')
        values['nominal_risk_free_rate'] = user_inputs.get('nominal_risk_free_rate')
        values['expected_S&P500_return'] = user_inputs.get('expected_S&P500_return')
        values['cost_of_preferred'] = user_inputs.get('cost_of_preferred')
        values['cost_of_debt'] = user_inputs.get('cost_of_debt')

        # Log extracted values for debugging
        print(f"🔍 EXTRACTED VALUES:")
        for key, value in values.items():
            if value is None:
                print(f"  {key}: None")
            elif isinstance(value, (int, float)):
                print(f"  {key}: {value:,.0f}")
            else:
                print(f"  {key}: {value}")

        return values
    

    def _find_value_by_keywords(self, statement_data: Dict, keywords: List[str]) -> float:
        """Find a value by matching against dict keys, standard_concept, or concept fields.

        The sec_service keys entries by edgartools' `standard_concept` (falling
        back to the cleaned us-gaap concept). We also inspect each entry's
        `standard_concept` and `concept` fields so callers don't have to know
        which naming variant was chosen for a given filing.
        """
        if not isinstance(statement_data, dict) or not statement_data:
            return 0.0

        for keyword in keywords:
            # Direct key match — fast path.
            value_data = statement_data.get(keyword)
            if isinstance(value_data, dict) and value_data.get('value') is not None:
                return float(value_data['value'])

            # Secondary: scan entries for standard_concept / concept match.
            for entry in statement_data.values():
                if not isinstance(entry, dict):
                    continue
                if entry.get('standard_concept') == keyword or entry.get('concept') == keyword:
                    value = entry.get('value')
                    if value is not None:
                        return float(value)

        # Tertiary: CamelCase-prefix fallback. Filers occasionally tag a
        # concept with a longer suffix variant (e.g.
        # `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest`
        # in place of `StockholdersEquity`). Match only when the next
        # character is uppercase so `Revenue` doesn't false-positive against
        # `RevenueAndExpenseSomething` while still catching
        # `RevenueFromContractWithCustomer*`. We require an uppercase
        # boundary to avoid matching unrelated families like
        # `EquityMethodInvestments` when asked for `StockholdersEquity`.
        for keyword in keywords:
            for entry in statement_data.values():
                if not isinstance(entry, dict):
                    continue
                for field in ('standard_concept', 'concept'):
                    name = entry.get(field) or ''
                    if (
                        name.startswith(keyword)
                        and len(name) > len(keyword)
                        and name[len(keyword)].isupper()
                    ):
                        value = entry.get('value')
                        if value is not None:
                            return float(value)
        return 0.0
    
# ------------------------------------------------------------

    def _calculate_ratios(self, values: Dict[str, float], schema: str = "unknown") -> Dict[str, Dict[str, Any]]:
        """Calculate financial ratios from extracted values.

        `schema` is one of services.filer_schema.SCHEMA_*. When a ratio is
        blank because the filer's schema doesn't include the input line
        (e.g. airline has no SG&A), the resulting ratio dict carries a
        `null_reason` so the UI can render N/A with an explanatory tooltip
        instead of a silent blank.
        """
        from services.filer_schema import null_reason_for
        ratios = {}

        def _try_emit_null(ratio_key: str, label: str) -> None:
            """If the schema gives a structural reason this ratio is blank,
            emit a null result with the reason. Otherwise leave the key
            absent (preserves prior behavior for unexplained blanks)."""
            reason = null_reason_for(ratio_key, schema)
            if reason:
                ratios[ratio_key] = {
                    'value': None,
                    'label': label,
                    'formatted': 'N/A',
                    'null_reason': reason,
                }
        
        # Cost of Equity
        if values['nominal_risk_free_rate'] is not None and values['company_beta'] is not None and values['expected_S&P500_return'] is not None:
            cost_of_equity = values['nominal_risk_free_rate'] + values['company_beta'] * (values['expected_S&P500_return'] - values['nominal_risk_free_rate'])
            ratios['cost_of_equity'] = self._create_ratio_result(cost_of_equity, 'Cost of Equity')

        # After-tax cost of debt
        if values.get('effective_tax_rate') is not None and values['cost_of_debt'] is not None: 
            after_tax_cost_of_debt = round(values['cost_of_debt'] * (1 - values['effective_tax_rate']) * 100,2)
            ratios['after_tax_cost_of_debt'] = self._create_ratio_result(after_tax_cost_of_debt, 'After-Tax Cost of Debt')

        # Equity Market Value = Shares Outstanding * Stock Price
        if values['shares_outstanding'] > 0 and values['stock_price'] is not None:
            equity_market_value = values['shares_outstanding'] * values['stock_price']
            ratios['equity_market_value'] = self._create_ratio_result(equity_market_value, 'Equity Market Value')

        # Total Capital = equity market value + long term debt + preferred stock
        if 'equity_market_value' in ratios and values['long_term_debt'] is not None and values['preferred_stock'] is not None:
            total_capital = ratios['equity_market_value']['value'] + values['long_term_debt'] + values['preferred_stock']
            ratios['total_capital'] = self._create_ratio_result(total_capital, 'Total Capital')

        # Equity Weight = Equity Market Value / Total Capital
        if 'equity_market_value' in ratios and 'total_capital' in ratios and ratios['total_capital']['value'] > 0:
            equity_weight = round(ratios['equity_market_value']['value'] / ratios['total_capital']['value'],2)
            ratios['equity_weight'] = self._create_ratio_result(equity_weight, 'Equity Weight')

        # Debt Weight = (Long Term Debt + Preferred Stock) / Total Capital
        if values['long_term_debt'] is not None and values['preferred_stock'] is not None and 'total_capital' in ratios and ratios['total_capital']['value'] > 0:
            debt_weight = round(values['long_term_debt']/ ratios['total_capital']['value'],2)
            ratios['debt_weight'] = self._create_ratio_result(debt_weight, 'Debt Weight')

        # preferred weight = preferred stock / total capital
        if values['preferred_stock'] is not None and 'total_capital' in ratios and ratios['total_capital']['value'] > 0:
            preferred_weight = round(values['preferred_stock']/ ratios['total_capital']['value'],2)
            ratios['preferred_weight'] = self._create_ratio_result(preferred_weight, 'Preferred Stock Weight')

        # Weighted Average Cost of Capital (WACC) = (Equity Weight * Cost of Equity) + (Debt Weight * After-Tax Cost of Debt) + (Preferred Weight * Cost of Preferred)
        if 'equity_weight' in ratios and 'cost_of_equity' in ratios and 'debt_weight' in ratios and 'after_tax_cost_of_debt' in ratios and 'preferred_weight' in ratios and values['cost_of_preferred'] is not None:    
            wacc = round((ratios['equity_weight']['value'] * ratios['cost_of_equity']['value']) + (ratios['debt_weight']['value'] * ratios['after_tax_cost_of_debt']['value']) + (ratios['preferred_weight']['value'] * values['cost_of_preferred']),2)
            ratios['wacc'] = self._create_ratio_result(wacc, 'Weighted Average Cost of Capital')    

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
            _try_emit_null('gross_profit_margin', 'Gross Profit Margin')

        # Operating Margin = (Operating Income / Revenue) * 100
        if values['revenue'] > 0 and values['operating_income'] != 0:
            operating_margin = (values['operating_income'] / values['revenue']) * 100
            ratios['operating_margin'] = self._create_ratio_result(operating_margin, 'Operating Margin')
        else:
            _try_emit_null('operating_margin', 'Operating Margin')
        
        # Net Margin = (Net Income / Revenue) * 100
        if values['revenue'] > 0 and values['net_income'] != 0:
            net_margin = (values['net_income'] / values['revenue']) * 100
            ratios['net_margin'] = self._create_ratio_result(net_margin, 'Net Margin')
        
        # EBITDA Margin = (EBITDA / Revenue) * 100
        # EBITDA = Operating Income + Depreciation & Amortization
        ebitda = values['operating_income'] + values['depreciation_amortization']
        if values['revenue'] > 0 and ebitda != 0:
            ebitda_margin = (ebitda / values['revenue']) * 100
            ratios['ebitda_margin'] = self._create_ratio_result(ebitda_margin, 'EBITDA Margin')
        
        # Current Ratio = Current Assets / Cur
        # rent Liabilities
        if values['current_liabilities'] > 0:
            current_ratio = values['current_assets'] / values['current_liabilities']
            ratios['current_ratio'] = self._create_ratio_result(current_ratio, 'Current Ratio')
        else:
            _try_emit_null('current_ratio', 'Current Ratio')

        # Quick Ratio = (Current Assets - Inventory) / Current Liabilities
        if values['current_liabilities'] > 0:
            quick_ratio = (values['current_assets'] - values['inventory'] - values['deffered_tax_assets'] - values['PrepaidExpensesAndOtherCurrentAssets']) / values['current_liabilities']
            ratios['quick_ratio'] = self._create_ratio_result(quick_ratio, 'Quick Ratio')
        else:
            _try_emit_null('quick_ratio', 'Quick Ratio')
        
        # Cash Ratio = Cash / Current Liabilities
        if values['current_liabilities'] > 0:
            cash_ratio = (values['cash'] + values['short_term_investments']) / values['current_liabilities']
            ratios['cash_ratio'] = self._create_ratio_result(cash_ratio, 'Cash Ratio')
        
        # Debt to Equity = Long Term Debt / Total Equity
        if values['total_equity'] > 0:
            debt_to_equity = values['long_term_debt'] / values['total_equity']
            ratios['debt_to_equity'] = self._create_ratio_result(debt_to_equity, 'Debt to Equity')
        
        # Debt to Total Capitalization = Long Term Debt / (Long Term Debt + Total Equity).
        # Kept on the same decimal scale as Debt to Equity so the two ratios
        # are directly comparable (D/TC must be < D/E whenever equity > 0).
        total_capitalization = values['long_term_debt'] + values['total_equity']
        if total_capitalization > 0:
            debt_to_cap = values['long_term_debt'] / total_capitalization
            ratios['debt_to_total_capitalization'] = self._create_ratio_result(debt_to_cap, 'Debt to Total Capitalization')
        
        # Total Assets to Equity = Total Assets / Total Equity
        if values['total_equity'] > 0:
            assets_to_equity = values['total_assets'] / values['total_equity']
            ratios['total_assets_to_equity'] = self._create_ratio_result(assets_to_equity, 'Total Assets/Equity')
        
        # Book Value = (assets - liabilities) / shares outstanding
        if values['shares_outstanding'] > 0:
            book_value = (values['total_assets']-values['total_liabilities']) / values['shares_outstanding']
            ratios['book_value'] = self._create_ratio_result(book_value, 'Book Value')

        # Tangible Book Value = (assets - goodwill - liabilities) / shares outstanding
        if values['shares_outstanding'] > 0:
            tangible_book_value = (values['total_assets']- values['total_liabilities']- values['goodwill']) / values['shares_outstanding']
            ratios['tangible_book_value'] = self._create_ratio_result(tangible_book_value, 'Tangible Book Value')

        # Average Age of Plant = Accumulated Depreciation / Depreciation Expense
        if values['depreciation_amortization'] >0  and values['accumulated_depreciation']:
            average_age_of_plant = values['accumulated_depreciation'] / values['depreciation_amortization']
            ratios['average_age_of_plant'] = self._create_ratio_result(average_age_of_plant, 'Average Age of Plant')

        # Average Remaining Life of Plant = Net PP&E / Depreciation Expense
        if values['depreciation_amortization'] > 0 and values['PP&E_net']:
            average_remaining_life_of_plant = values['PP&E_net'] / values['depreciation_amortization']
            ratios['average_remaining_life_of_plant'] = self._create_ratio_result(average_remaining_life_of_plant, 'Average Remaining Life of Plant')

        # Average Total Life Span of Plant = Gross PP&E / Depreciation Expense
        if values['depreciation_amortization'] > 0 and values['pp&e_gross']:
            average_total_life_span_of_plant = values['pp&e_gross'] / values['depreciation_amortization']
            ratios['average_total_life_span_of_plant'] = self._create_ratio_result(average_total_life_span_of_plant, 'Average Total Life Span of Plant')    

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
        if values['inventory'] > 0 and values['cost_of_goods_sold'] != 0:
            inventory_turnover = abs(values['cost_of_goods_sold']) / values['inventory']
            ratios['inventory_turnover'] = self._create_ratio_result(inventory_turnover, 'Inventory Turnover')
        else:
            _try_emit_null('inventory_turnover', 'Inventory Turnover')
        
        # Receivables Turnover = Revenue / Accounts Receivable.
        # Higher = AR cycles faster (cash collected more times per year).
        if values['accounts_receivable'] > 0:
            receivables_turnover = values['revenue'] / values['accounts_receivable']
            ratios['receivables_turnover'] = self._create_ratio_result(receivables_turnover, 'Receivables Turnover')
        
        # Operating Cash Flow to Net Income = Operating Cash Flow / Net Income
        if values['net_income'] != 0:
            ocf_to_net_income = values['operating_cash_flow'] / values['net_income']
            ratios['operating_cash_flow_to_net_income'] = self._create_ratio_result(ocf_to_net_income, 'Operating Cash Flow/Net Income')
        
        # Capex to Depreciation = |Capital Expenditures| / Depreciation.
        # CapEx is signed (often negative as a cash outflow); the ratio is
        # a reinvestment-intensity read, so take magnitudes so the result
        # is always positive.
        if values['depreciation_amortization'] > 0:
            capex_to_depreciation = abs(values['capex']) / values['depreciation_amortization']
            ratios['capex_to_depreciation'] = self._create_ratio_result(capex_to_depreciation, 'Capex/Depreciation')
        
        # Net Working Capital Ratio = (Current Assets - Current Liabilities) / Total Assets
        if values['total_assets'] > 0:
            net_working_capital_ratio = (values['current_assets'] - values['current_liabilities']) / values['total_assets']
            ratios['net_working_capital_ratio'] = self._create_ratio_result(net_working_capital_ratio, 'Net Working Capital Ratio')
        
        # SGA as percent of Revnue = SGA/Revenue
        if values['revenue'] > 0 and values['sg&a'] != 0:
            sga_percent = (values['sg&a'] / values['revenue']) * 100
            ratios['sga_percent_of_revenue'] = self._create_ratio_result(sga_percent, 'SG&A as % of Revenue')
        else:
            _try_emit_null('sga_percent_of_revenue', 'SG&A as % of Revenue')
        
        # Effective tax rate = income taxes / pretax income (stored as percent)
        pretax_income = values['operating_income']+values['interest_expense']+values['interest_income']+values['non_operating_income']
        if pretax_income > 0 and values['income_taxes'] != 0:
            effective_tax_rate = (values['income_taxes'] / pretax_income) * 100
            ratios['effective_tax_rate'] = self._create_ratio_result(effective_tax_rate, 'Effective Tax Rate')

        # Free Cash Flow
        tax_rate_decimal = (ratios['effective_tax_rate']['value'] / 100) if 'effective_tax_rate' in ratios else 0.21
        free_cash_flow = values['operating_cash_flow']+abs(values['capex'])+abs((values['interest_expense'])*(1-tax_rate_decimal))
        ratios['free_cash_flow'] = self._create_ratio_result(free_cash_flow, 'Free Cash Flow')
        
        # Return on Invested Capital (ROIC) = Net Income / (Total Assets - Current Liabilities) * 100
        invested_capital = values['long_term_debt']+ values['total_equity']
        if invested_capital > 0:
            roic = (values['net_income'] / invested_capital) * 100
            ratios['return_on_invested_capital'] = self._create_ratio_result(roic, 'Return on Invested Capital (ROIC)')

        # Earnings Per Share — prefer the filer-tagged value; fall back to
        # NetIncome / SharesOutstanding so EPS still shows when EPS isn't
        # tagged but its inputs are.
        if values.get('eps_basic'):
            ratios['earnings_per_share'] = self._create_ratio_result(values['eps_basic'], 'Earnings Per Share')
        elif values['shares_outstanding'] > 0 and values['net_income'] != 0:
            eps = values['net_income'] / values['shares_outstanding']
            print(f"🧮 EPS calculation: {values['net_income']:,.0f} / {values['shares_outstanding']:,.0f} = {eps:.2f}")
            ratios['earnings_per_share'] = self._create_ratio_result(eps, 'Earnings Per Share')
        
        # ---------------------------
        # Additional Common Size Ratios
        # ---------------------------
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
        """Format ratio value for display.

        Display convention overrides come first — a label like "Current
        Ratio" is normally a multiple (1.5x), but the user wants it shown
        as a percentage (150.00%). The underlying stored value stays a
        raw ratio; only the formatted string scales.
        """
        # Ratios the UI shows as percentages even though the underlying
        # value is a multiple (e.g. current ratio 2.0 → "200.00%").
        pct_labels = {
            'Current Ratio',
            'Quick Ratio',
            'Cash Ratio',
            'Net Working Capital Ratio',
            'Debt to Equity',
            'Debt to Total Capitalization',
        }
        # Multiples kept as 'x' suffix even though their label doesn't
        # contain 'Ratio' or 'Turnover' (default-branch would otherwise
        # drop the suffix).
        x_labels = {
            'Total Assets/Equity',
            'Operating Cash Flow/Net Income',
            'Capex/Depreciation',
        }

        if label in pct_labels:
            return f"{value * 100:.2f}%"
        if label in x_labels:
            return f"{value:.2f}x"
        if 'Margin' in label or 'ROE' in label or 'ROA' in label or 'ROIC' in label or 'Tax Rate' in label or 'Return on' in label:
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
        non_zero_values = sum(
            1 for v in values.values() if isinstance(v, (int, float)) and v > 0
        )
        total_values = len(values)
        
        return {
            'completeness': round((non_zero_values / total_values) * 100, 1),
            'non_zero_values': non_zero_values,
            'total_values': total_values,
            'quality_score': 'Good' if non_zero_values / total_values > 0.5 else 'Poor'
        }
    ### ------ DCF related calculations -------
    def _find_latest_cash_flow_year(self, cash_flow: Dict[str, Any]) -> Optional[int]:
        """Find the latest fiscal year from cash flow statement metadata."""
        latest_year = None

        def extract_year(value: Any) -> Optional[int]:
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str) and value.isdigit():
                return int(value)
            if isinstance(value, str):
                match = re.search(r"(\d{4})", value)
                if match:
                    return int(match.group(1))
            return None

        for item in cash_flow.values():
            if isinstance(item, dict):
                for key in ('fiscal_year', 'fy', 'year'):
                    year_value = extract_year(item.get(key))
                    if year_value is not None:
                        latest_year = year_value if latest_year is None else max(latest_year, year_value)

                period_value = item.get('period') or item.get('end')
                year_value = extract_year(period_value)
                if year_value is not None:
                    latest_year = year_value if latest_year is None else max(latest_year, year_value)

            elif isinstance(item, list):
                for subitem in item:
                    if isinstance(subitem, dict):
                        for key in ('fiscal_year', 'fy', 'year'):
                            year_value = extract_year(subitem.get(key))
                            if year_value is not None:
                                latest_year = year_value if latest_year is None else max(latest_year, year_value)

                        period_value = subitem.get('period') or subitem.get('end')
                        year_value = extract_year(period_value)
                        if year_value is not None:
                            latest_year = year_value if latest_year is None else max(latest_year, year_value)

        return latest_year

    def compute_wacc(
        self,
        financial_data: Dict[str, Any],
        beta: float,
        risk_free_rate: float,
        expected_market_return: float,
        stock_price: float,
        cost_of_debt: float,
        cost_of_preferred: float,
    ) -> Dict[str, Any]:
        """Compute Weighted Average Cost of Capital from filings + market inputs.

        Capital structure (shares, long-term debt, preferred stock, income
        taxes, pretax income proxy) is pulled from the loaded statements.
        Cost of equity is CAPM. Cost of debt and cost of preferred come
        from the caller (slider inputs). Effective tax rate is derived
        empirically as income_taxes / pretax_income (mirroring the ratio
        panel) and applied to the user's cost of debt to produce the
        after-tax figure. Rates are decimals (0.045 = 4.5%).
        """
        notes: List[str] = []

        # Reuse the shared extractor — it already knows how to find every
        # input we need. The signature takes the three statements
        # positionally, with user_inputs as the last keyword argument.
        values = self._extract_key_values(
            financial_data.get('income_statement', {}),
            financial_data.get('balance_sheet', {}),
            financial_data.get('cash_flow', {}),
            user_inputs={
                'stock_price': stock_price,
                'company_beta': beta,
                'nominal_risk_free_rate': risk_free_rate,
                'expected_S&P500_return': expected_market_return,
                'cost_of_preferred': cost_of_preferred,
                'cost_of_debt': cost_of_debt,
            },
        )

        shares = values.get('shares_outstanding') or 0
        ltd = values.get('long_term_debt') or 0
        preferred = values.get('preferred_stock') or 0
        income_taxes = values.get('income_taxes') or 0
        # _calculate_ratios builds pretax_income as op_income + int_exp + int_inc + non_op;
        # mirror that here so the effective tax rate matches the ratio panel.
        pretax_income = (
            (values.get('operating_income') or 0)
            + (values.get('interest_expense') or 0)
            + (values.get('interest_income') or 0)
            + (values.get('non_operating_income') or 0)
        )

        # --- Market cap + weights (equity / debt / preferred) ------------
        market_cap = shares * stock_price if shares > 0 and stock_price > 0 else None
        if market_cap is None:
            notes.append(
                "Market cap unavailable — shares outstanding or stock price missing/zero."
            )

        total_capital = None
        weight_equity = None
        weight_debt = None
        weight_preferred = None
        if market_cap is not None:
            total_capital = market_cap + ltd + preferred
            if total_capital > 0:
                weight_equity = market_cap / total_capital
                weight_debt = ltd / total_capital if ltd > 0 else 0.0
                weight_preferred = preferred / total_capital if preferred > 0 else 0.0
                if ltd <= 0 and preferred <= 0:
                    notes.append("No long-term debt or preferred stock found; weighting as 100% equity.")

        # --- Cost of equity (CAPM) ---------------------------------------
        cost_of_equity = risk_free_rate + beta * (expected_market_return - risk_free_rate)

        # --- Effective tax rate from filings -----------------------------
        effective_tax_rate = None
        if pretax_income > 0 and income_taxes != 0:
            effective_tax_rate = income_taxes / pretax_income
        else:
            notes.append("Effective tax rate not derivable from filings; using 0% for the tax shield.")
            effective_tax_rate = 0.0

        # --- After-tax cost of debt (uses USER cost of debt) -------------
        after_tax_cost_of_debt = cost_of_debt * (1 - effective_tax_rate)

        # --- WACC = w_e·k_e + w_d·k_d_at + w_p·k_p -----------------------
        wacc = None
        if weight_equity is not None:
            debt_component = (weight_debt or 0.0) * after_tax_cost_of_debt
            pref_component = (weight_preferred or 0.0) * cost_of_preferred
            wacc = weight_equity * cost_of_equity + debt_component + pref_component

        return {
            'shares_outstanding': shares if shares > 0 else None,
            'long_term_debt': ltd if ltd > 0 else None,
            'preferred_stock': preferred if preferred > 0 else None,
            'market_cap': market_cap,
            'total_capital': total_capital,
            'weight_equity': weight_equity,
            'weight_debt': weight_debt,
            'weight_preferred': weight_preferred,
            'cost_of_equity': cost_of_equity,
            'after_tax_cost_of_debt': after_tax_cost_of_debt,
            'effective_tax_rate': effective_tax_rate,
            'wacc': wacc,
            'notes': notes,
        }

    def present_values_fcf(
        self,
        financial_data: Dict[str, Any],
        discount_rate: float,
        interim_growth_rate: float,
        terminal_growth_rate: float,
        periods: int = 5,
        stock_price: float = 0.0,
    ) -> Dict[str, Any]:
        """Calculate present values for projected free cash flows.

        Args:
            financial_data: Financial data containing income_statement, balance_sheet, cash_flow
            discount_rate: Discount rate as a decimal (e.g. 0.10 for 10%).
            interim_growth_rate: Year-over-year growth rate for each forecasted year.
            terminal_growth_rate: Growth rate used to calculate terminal value at the end of the projection.
            periods: Number of periods to project forward.

        Returns:
            A dictionary containing projected FCF schedule, terminal value, and present values.
        """
        if periods < 0:
            raise ValueError("periods must be zero or a positive integer")
        if discount_rate is None:
            raise ValueError("discount_rate is required")
        if interim_growth_rate is None:
            raise ValueError("interim_growth_rate is required")
        if terminal_growth_rate is None:
            raise ValueError("terminal_growth_rate is required")

        # Extract values
        values = self._extract_key_values(
            financial_data.get('income_statement', {}),
            financial_data.get('balance_sheet', {}),
            financial_data.get('cash_flow', {}),
        )

        # Calculate unlevered free cash flow.
        #   UFCF = OCF − |CapEx| + |InterestExpense| × (1 − τ)
        # CapEx from edgartools is a payment (sign varies by filer) so we
        # subtract the magnitude. Interest expense is stored signed in the
        # extracted values — usually negative — so we take the magnitude
        # too so the after-tax interest add-back lands with the right sign
        # regardless of how the filer tagged it.
        # Effective tax rate is derived from the filing the same way
        # compute_wacc and _calculate_ratios derive it: income_taxes ÷
        # pretax_income (op_income + interest_expense + interest_income +
        # non_operating_income). Falls back to the 21% statutory only when
        # the inputs aren't extractable.
        capex_outflow = abs(values.get('capex', 0) or 0)
        interest_abs = abs(values.get('interest_expense', 0) or 0)

        income_taxes = values.get('income_taxes') or 0
        pretax_income = (
            (values.get('operating_income') or 0)
            + (values.get('interest_expense') or 0)
            + (values.get('interest_income') or 0)
            + (values.get('non_operating_income') or 0)
        )
        if pretax_income > 0 and income_taxes != 0:
            effective_tax_rate = income_taxes / pretax_income
        else:
            effective_tax_rate = 0.21

        free_cash_flow = (
            values['operating_cash_flow']
            - capex_outflow
            + interest_abs * (1 - effective_tax_rate)
        )

        latest_year = self._find_latest_cash_flow_year(financial_data['cash_flow'])
        if latest_year is None:
            raise ValueError("Unable to infer latest filing year from cash_flow statement.")

        if isinstance(latest_year, str):
            try:
                latest_year = int(latest_year)
            except ValueError:
                raise ValueError("latest_year must be an integer or numeric string")

        schedule = []
        present_values = []
        projected_fcf_list = []
        total_present_value = 0.0
        projected_fcf = free_cash_flow

        for period in range(periods):
            year = latest_year + period + 1  # Start from next year
            discount_factor = (1 + discount_rate) ** (period + 1)
            present_value = projected_fcf / discount_factor

            schedule.append({
                'period': period + 1,
                'year': year,
                'projected_fcf': round(projected_fcf, 2),
                'discount_factor': round(discount_factor, 6),
                'present_value': round(present_value, 2)
            })
            
            projected_fcf_list.append(round(projected_fcf, 2))
            present_values.append(round(present_value, 2))
            total_present_value += present_value

            projected_fcf *= (1 + interim_growth_rate)

        # Gordon growth diverges when discount_rate ≤ terminal_growth_rate;
        # nudge an exact-equality denominator off zero so the math returns a
        # (large) signed value instead of a ZeroDivisionError. The signed
        # result lets the UI surface the divergence rather than blocking the
        # user from running sensitivity scenarios in that region.
        denom = discount_rate - terminal_growth_rate
        if abs(denom) < 1e-9:
            denom = 1e-9 if denom >= 0 else -1e-9

        # Terminal value: FCF_N × (1 + g_terminal) / (WACC − g_terminal).
        # Uses the last FORECAST year's FCF (projected_fcf_list[-1]); the
        # loop variable `projected_fcf` has already been incremented to the
        # year-(N+1) value at this point, which would double-apply growth.
        last_forecast_fcf = projected_fcf_list[-1] if projected_fcf_list else free_cash_flow
        terminal_value = last_forecast_fcf * (1 + terminal_growth_rate) / denom
        terminal_discount_factor = (1 + discount_rate) ** periods if periods > 0 else 1.0
        terminal_present_value = terminal_value / terminal_discount_factor

        # Append the terminal as the trailing row of the schedule so it
        # always appears as the last FCF in the table — same PV math
        # (discounted at year N), then folded into total PV.
        schedule.append({
            'period': periods + 1,
            'year': latest_year + periods,
            'projected_fcf': round(terminal_value, 2),
            'discount_factor': round(terminal_discount_factor, 6),
            'present_value': round(terminal_present_value, 2),
            'is_terminal': True,
        })
        projected_fcf_list.append(round(terminal_value, 2))
        present_values.append(round(terminal_present_value, 2))
        total_present_value += terminal_present_value

        # Intrinsic enterprise value = sum of all discounted cash flows
        # (forecast + terminal). Equity bridge backs out net debt
        # (debt − cash) so per-share value reflects the DCF, not the
        # current market cap.
        shares_outstanding = values.get('shares_outstanding') or 0
        total_debt = values.get('long_term_debt') or 0
        cash = values.get('cash') or 0
        enterprise_value = total_present_value
        equity_value = enterprise_value - total_debt + cash
        per_share_value = equity_value / shares_outstanding if shares_outstanding > 0 else 0

        return {
            'latest_year': latest_year,
            'projected_fcf': projected_fcf_list,
            'present_values': present_values,
            'terminal_value': round(terminal_value, 2),
            'enterprise_value': round(enterprise_value, 2),
            'equity_value': round(equity_value, 2),
            'per_share_value': round(per_share_value, 2),
            'schedule': schedule
        }

    # ------------------------------------------------------------------
    # Reverse DCF
    # ------------------------------------------------------------------
    # Default brentq search ranges per solve target. Tight enough to keep
    # the solver fast, wide enough to cover any defensible assumption.
    # Caller can override via lower_bound/upper_bound on the request.
    _REVERSE_DCF_BOUNDS = {
        'revenue_growth':   (-0.50, 1.00),   # -50% to +100% interim growth
        'operating_margin': (0.001, 0.95),   # 0.1% to 95% operating margin
        'wacc':             (0.005, 0.50),   # 0.5% to 50% discount rate
        'terminal_growth':  (-0.10, 0.20),   # -10% to +20% terminal growth
    }

    def solve_reverse_dcf(
        self,
        financial_data: Dict[str, Any],
        target_price: float,
        solve_for: str,
        discount_rate: float,
        interim_growth_rate: float,
        terminal_growth_rate: float,
        forecast_periods: int = 5,
        lower_bound: Optional[float] = None,
        upper_bound: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Find the single assumption that makes the DCF per-share value
        equal the current market price.

        ``solve_for`` is one of ``revenue_growth``, ``operating_margin``,
        ``wacc`` or ``terminal_growth``. The other three plus
        forecast_periods are held constant at the supplied values.

        For ``operating_margin`` the DCF FCF is rescaled by the ratio
        of (target margin / current implied FCF margin) — i.e. we
        proxy "operating margin" with FCF/Revenue since the existing
        DCF starts from OCF, not from an operating-income build-up.
        That keeps the solve mathematically clean while staying
        consistent with how the rest of the DCF flow already values
        the company.

        Uses ``scipy.optimize.brentq`` for guaranteed convergence on a
        bracketed root.
        """
        if solve_for not in self._REVERSE_DCF_BOUNDS:
            raise ValueError(
                f"solve_for must be one of: {list(self._REVERSE_DCF_BOUNDS)}"
            )
        if target_price <= 0:
            raise ValueError("target_price must be positive")

        notes: List[str] = []
        default_lo, default_hi = self._REVERSE_DCF_BOUNDS[solve_for]
        lo = lower_bound if lower_bound is not None else default_lo
        hi = upper_bound if upper_bound is not None else default_hi

        # Gordon-growth divergence: the terminal-value formula goes
        # signed-negative when r ≤ g_terminal. brentq needs a continuous
        # bracketed root, and the discontinuity at r = g_terminal breaks
        # that. Clamp each solve to stay on the convergent side of the
        # boundary so the price curve is monotone across the range.
        if solve_for == 'wacc':
            clamp = terminal_growth_rate + 0.005
            if lo < clamp:
                lo = clamp
                notes.append(
                    f"WACC lower bound clamped to {lo:.2%} to stay above "
                    f"terminal growth ({terminal_growth_rate:.2%}) and avoid "
                    f"Gordon-growth divergence."
                )
        elif solve_for == 'terminal_growth':
            clamp = discount_rate - 0.005
            if hi > clamp:
                hi = clamp
                notes.append(
                    f"Terminal growth upper bound clamped to {hi:.2%} to stay below "
                    f"WACC ({discount_rate:.2%}) and avoid Gordon-growth divergence."
                )

        # For operating_margin we need the current FCF-margin baseline
        # (FCF₀ / Revenue₀) so the solve target is interpreted as a
        # candidate operating margin and the FCF gets scaled by
        # candidate / current.
        values_for_margin = None
        current_fcf_margin = None
        if solve_for == 'operating_margin':
            values_for_margin = self._extract_key_values(
                financial_data.get('income_statement', {}),
                financial_data.get('balance_sheet', {}),
                financial_data.get('cash_flow', {}),
            )
            revenue = values_for_margin.get('revenue') or 0
            if revenue <= 0:
                raise ValueError("Cannot solve for operating margin: revenue not extractable from filings.")
            capex_abs = abs(values_for_margin.get('capex', 0) or 0)
            int_abs = abs(values_for_margin.get('interest_expense', 0) or 0)
            tax_rate = self._effective_tax_rate_from_values(values_for_margin)
            current_fcf = (
                (values_for_margin.get('operating_cash_flow') or 0)
                - capex_abs
                + int_abs * (1 - tax_rate)
            )
            current_fcf_margin = current_fcf / revenue
            if current_fcf_margin <= 0:
                raise ValueError(
                    "Current FCF margin is non-positive; cannot reverse-solve for "
                    "operating margin off this filing."
                )
            notes.append(
                f"Operating margin solve uses current FCF/Revenue = {current_fcf_margin:.2%} "
                f"as baseline; result expresses the FCF margin that justifies the price."
            )

        def price_at(x: float) -> float:
            """Run the DCF with `x` substituted for the solve_for variable."""
            d = discount_rate
            ig = interim_growth_rate
            tg = terminal_growth_rate
            if solve_for == 'revenue_growth':
                ig = x
            elif solve_for == 'wacc':
                d = x
            elif solve_for == 'terminal_growth':
                tg = x

            result = self.present_values_fcf(
                financial_data,
                discount_rate=d,
                interim_growth_rate=ig,
                terminal_growth_rate=tg,
                periods=forecast_periods,
                stock_price=0.0,  # not used in per-share value anymore
            )
            price = result['per_share_value']

            if solve_for == 'operating_margin':
                # Scale per-share linearly with candidate margin. The
                # underlying DCF math is linear in FCF, so per_share at
                # candidate_margin = per_share(current_margin) × (x / current_fcf_margin).
                price = price * (x / current_fcf_margin)
            return price

        def f(x: float) -> float:
            return price_at(x) - target_price

        # Bracket the root. If both endpoints have the same sign brentq
        # raises — surface a clean note instead of a stack trace.
        f_lo = f(lo)
        f_hi = f(hi)
        if f_lo * f_hi > 0:
            # No sign change within the bounds → no defensible value
            # justifies the price in this range.
            direction = "above" if f_lo > 0 else "below"
            return {
                'implied_value': None,
                'dcf_price_at_solution': None,
                'held_constant': {
                    'discount_rate': discount_rate,
                    'interim_growth_rate': interim_growth_rate,
                    'terminal_growth_rate': terminal_growth_rate,
                    'forecast_periods': forecast_periods,
                },
                'search_bounds': {'lower': lo, 'upper': hi},
                'converged': False,
                'notes': notes + [
                    f"No solution exists in [{lo:.4f}, {hi:.4f}] — the DCF stays "
                    f"{direction} the target price across the entire range. "
                    f"Widen the bounds or check the other assumptions."
                ],
            }

        try:
            root = brentq(f, lo, hi, xtol=1e-6, maxiter=200)
            dcf_price = price_at(root)
            # Build held_constant excluding the variable being solved —
            # caller asked for the solved metric's user-set default not to
            # be returned, so the comparison UI never reads a stale value
            # for the variable the solver just overrode.
            held = {
                'discount_rate': discount_rate,
                'interim_growth_rate': interim_growth_rate,
                'terminal_growth_rate': terminal_growth_rate,
                'forecast_periods': forecast_periods,
            }
            solve_to_key = {
                'wacc': 'discount_rate',
                'revenue_growth': 'interim_growth_rate',
                'terminal_growth': 'terminal_growth_rate',
            }
            drop = solve_to_key.get(solve_for)
            if drop is not None:
                held.pop(drop, None)
            return {
                'implied_value': float(root),
                'dcf_price_at_solution': round(float(dcf_price), 4),
                'held_constant': held,
                'search_bounds': {'lower': lo, 'upper': hi},
                'converged': True,
                'notes': notes,
            }
        except (ValueError, RuntimeError) as e:
            return {
                'implied_value': None,
                'dcf_price_at_solution': None,
                'held_constant': {
                    'discount_rate': discount_rate,
                    'interim_growth_rate': interim_growth_rate,
                    'terminal_growth_rate': terminal_growth_rate,
                    'forecast_periods': forecast_periods,
                },
                'search_bounds': {'lower': lo, 'upper': hi},
                'converged': False,
                'notes': notes + [f"Solver failed: {e}"],
            }

    def _effective_tax_rate_from_values(self, values: Dict[str, Any]) -> float:
        """Same formula compute_wacc + present_values_fcf use, isolated as
        a helper so the reverse-DCF baseline math stays in sync."""
        income_taxes = values.get('income_taxes') or 0
        pretax_income = (
            (values.get('operating_income') or 0)
            + (values.get('interest_expense') or 0)
            + (values.get('interest_income') or 0)
            + (values.get('non_operating_income') or 0)
        )
        if pretax_income > 0 and income_taxes != 0:
            return income_taxes / pretax_income
        return 0.21
