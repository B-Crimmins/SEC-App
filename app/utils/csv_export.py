import pandas as pd
import io
from typing import Dict, Any, List, cast
from app.models.financial_report import FinancialReport
from app.models.analysis import Analysis


def export_financial_report_to_csv(financial_report: FinancialReport) -> str:
    """Export financial report data to CSV format with separate sections for each statement"""
    # Create a list to store all data
    data_rows = []
    
    # Add metadata section
    data_rows.append(["FINANCIAL STATEMENT EXPORT"])
    data_rows.append([])
    data_rows.append(["Report Information"])
    data_rows.append(["Ticker", financial_report.ticker])
    data_rows.append(["Company Name", financial_report.company_name])
    data_rows.append(["Report Type", financial_report.report_type])
    data_rows.append(["Period", financial_report.period])
    data_rows.append(["Created At", str(financial_report.created_at)])
    data_rows.append([])
    data_rows.append([])
    
    # Add Income Statement section
    data_rows.append(["INCOME STATEMENT"])
    data_rows.append(["Line Item", "Value", "Unit", "Period", "Fiscal Year", "Fiscal Period", "Filing Date"])
    if financial_report.income_statement is not None:
        for concept, data in financial_report.income_statement.items():
            if isinstance(data, dict):
                value = data.get('value', '')
                unit = data.get('unit', '')
                period = data.get('period', '')
                fiscal_year = data.get('fiscal_year', '')
                fiscal_period = data.get('fiscal_period', '')
                filing_date = data.get('filing_date', '')
                label = data.get('label', concept)
                data_rows.append([label, value, unit, period, fiscal_year, fiscal_period, filing_date])
    else:
        data_rows.append(["No income statement data available", "", "", "", "", "", ""])
    data_rows.append([])
    data_rows.append([])
    
    # Add Balance Sheet section
    data_rows.append(["BALANCE SHEET"])
    data_rows.append(["Line Item", "Value", "Unit", "Period", "Fiscal Year", "Fiscal Period", "Filing Date"])
    if financial_report.balance_sheet is not None:
        for concept, data in financial_report.balance_sheet.items():
            if isinstance(data, dict):
                value = data.get('value', '')
                unit = data.get('unit', '')
                period = data.get('period', '')
                fiscal_year = data.get('fiscal_year', '')
                fiscal_period = data.get('fiscal_period', '')
                filing_date = data.get('filing_date', '')
                label = data.get('label', concept)
                data_rows.append([label, value, unit, period, fiscal_year, fiscal_period, filing_date])
    else:
        data_rows.append(["No balance sheet data available", "", "", "", "", "", ""])
    data_rows.append([])
    data_rows.append([])
    
    # Add Cash Flow Statement section
    data_rows.append(["CASH FLOW STATEMENT"])
    data_rows.append(["Line Item", "Value", "Unit", "Period", "Fiscal Year", "Fiscal Period", "Filing Date"])
    if financial_report.cash_flow is not None:
        for concept, data in financial_report.cash_flow.items():
            if isinstance(data, dict):
                value = data.get('value', '')
                unit = data.get('unit', '')
                period = data.get('period', '')
                fiscal_year = data.get('fiscal_year', '')
                fiscal_period = data.get('fiscal_period', '')
                filing_date = data.get('filing_date', '')
                label = data.get('label', concept)
                data_rows.append([label, value, unit, period, fiscal_year, fiscal_period, filing_date])
    else:
        data_rows.append(["No cash flow statement data available", "", "", "", "", "", ""])
    
    # Convert to CSV string
    output = io.StringIO()
    for row in data_rows:
        output.write(','.join([f'"{str(cell)}"' for cell in row]) + '\n')
    
    return output.getvalue()


def export_financial_report_to_excel_format(financial_report: FinancialReport) -> str:
    """Export financial report data to Excel-like CSV format with proper formatting"""
    # Create a list to store all data
    data_rows = []
    
    # Add header with company info
    data_rows.append([f"Financial Statements - {financial_report.company_name} ({financial_report.ticker})"])
    data_rows.append([f"Report Type: {financial_report.report_type} | Period: {financial_report.period} | Generated: {financial_report.created_at}"])
    data_rows.append([])
    
    # Income Statement Section
    data_rows.append(["INCOME STATEMENT"])
    data_rows.append(["Description", "Amount", "Currency", "Period End", "Fiscal Year", "Fiscal Period"])
    data_rows.append([])
    
    if financial_report.income_statement is not None:
        # Group by categories for better organization
        revenue_items = []
        expense_items = []
        other_items = []
        
        for concept, data in financial_report.income_statement.items():
            if isinstance(data, dict):
                value = data.get('value', '')
                unit = data.get('unit', '')
                period = data.get('period', '')
                fiscal_year = data.get('fiscal_year', '')
                fiscal_period = data.get('fiscal_period', '')
                label = data.get('label', concept)
                
                row_data = [label, value, unit, period, fiscal_year, fiscal_period]
                
                # Categorize items
                concept_lower = concept.lower()
                if any(keyword in concept_lower for keyword in ['revenue', 'sales', 'income']):
                    revenue_items.append(row_data)
                elif any(keyword in concept_lower for keyword in ['expense', 'cost', 'loss']):
                    expense_items.append(row_data)
                else:
                    other_items.append(row_data)
        
        # Add categorized items
        if revenue_items:
            data_rows.append(["REVENUES"])
            for item in revenue_items:
                data_rows.append(item)
            data_rows.append([])
        
        if expense_items:
            data_rows.append(["EXPENSES"])
            for item in expense_items:
                data_rows.append(item)
            data_rows.append([])
        
        if other_items:
            data_rows.append(["OTHER ITEMS"])
            for item in other_items:
                data_rows.append(item)
            data_rows.append([])
    else:
        data_rows.append(["No income statement data available", "", "", "", "", ""])
    
    data_rows.append([])
    data_rows.append([])
    
    # Balance Sheet Section
    data_rows.append(["BALANCE SHEET"])
    data_rows.append(["Description", "Amount", "Currency", "Period End", "Fiscal Year", "Fiscal Period"])
    data_rows.append([])
    
    if financial_report.balance_sheet is not None:
        # Group by categories
        asset_items = []
        liability_items = []
        equity_items = []
        
        for concept, data in financial_report.balance_sheet.items():
            if isinstance(data, dict):
                value = data.get('value', '')
                unit = data.get('unit', '')
                period = data.get('period', '')
                fiscal_year = data.get('fiscal_year', '')
                fiscal_period = data.get('fiscal_period', '')
                label = data.get('label', concept)
                
                row_data = [label, value, unit, period, fiscal_year, fiscal_period]
                
                # Categorize items
                concept_lower = concept.lower()
                if any(keyword in concept_lower for keyword in ['asset', 'cash', 'receivable', 'inventory', 'property', 'equipment']):
                    asset_items.append(row_data)
                elif any(keyword in concept_lower for keyword in ['liability', 'debt', 'payable', 'obligation']):
                    liability_items.append(row_data)
                elif any(keyword in concept_lower for keyword in ['equity', 'stock', 'capital', 'retained']):
                    equity_items.append(row_data)
                else:
                    asset_items.append(row_data)  # Default to assets
        
        # Add categorized items
        if asset_items:
            data_rows.append(["ASSETS"])
            for item in asset_items:
                data_rows.append(item)
            data_rows.append([])
        
        if liability_items:
            data_rows.append(["LIABILITIES"])
            for item in liability_items:
                data_rows.append(item)
            data_rows.append([])
        
        if equity_items:
            data_rows.append(["SHAREHOLDERS' EQUITY"])
            for item in equity_items:
                data_rows.append(item)
            data_rows.append([])
    else:
        data_rows.append(["No balance sheet data available", "", "", "", "", ""])
    
    data_rows.append([])
    data_rows.append([])
    
    # Cash Flow Statement Section
    data_rows.append(["CASH FLOW STATEMENT"])
    data_rows.append(["Description", "Amount", "Currency", "Period End", "Fiscal Year", "Fiscal Period"])
    data_rows.append([])
    
    if financial_report.cash_flow is not None:
        # Group by categories
        operating_items = []
        investing_items = []
        financing_items = []
        
        for concept, data in financial_report.cash_flow.items():
            if isinstance(data, dict):
                value = data.get('value', '')
                unit = data.get('unit', '')
                period = data.get('period', '')
                fiscal_year = data.get('fiscal_year', '')
                fiscal_period = data.get('fiscal_period', '')
                label = data.get('label', concept)
                
                row_data = [label, value, unit, period, fiscal_year, fiscal_period]
                
                # Categorize items
                concept_lower = concept.lower()
                if any(keyword in concept_lower for keyword in ['operating', 'net income', 'depreciation', 'amortization']):
                    operating_items.append(row_data)
                elif any(keyword in concept_lower for keyword in ['investing', 'capital expenditure', 'acquisition', 'purchase']):
                    investing_items.append(row_data)
                elif any(keyword in concept_lower for keyword in ['financing', 'dividend', 'stock', 'debt']):
                    financing_items.append(row_data)
                else:
                    operating_items.append(row_data)  # Default to operating
        
        # Add categorized items
        if operating_items:
            data_rows.append(["OPERATING ACTIVITIES"])
            for item in operating_items:
                data_rows.append(item)
            data_rows.append([])
        
        if investing_items:
            data_rows.append(["INVESTING ACTIVITIES"])
            for item in investing_items:
                data_rows.append(item)
            data_rows.append([])
        
        if financing_items:
            data_rows.append(["FINANCING ACTIVITIES"])
            for item in financing_items:
                data_rows.append(item)
            data_rows.append([])
    else:
        data_rows.append(["No cash flow statement data available", "", "", "", "", ""])
    
    # Convert to CSV string
    output = io.StringIO()
    for row in data_rows:
        output.write(','.join([f'"{str(cell)}"' for cell in row]) + '\n')
    
    return output.getvalue()


def export_analysis_to_csv(analysis: Analysis) -> str:
    """Export analysis data to CSV format"""
    # Create a list to store all data
    data_rows = []
    
    # Add metadata
    data_rows.append(["Analysis Information"])
    data_rows.append(["Analysis ID", analysis.id])
    data_rows.append(["Created At", str(analysis.created_at)])

    data_rows.append(["OpenAI Model Used", analysis.openai_model_used])
    data_rows.append(["Tokens Used", analysis.tokens_used])
    data_rows.append(["Processing Time (seconds)", analysis.processing_time])
    data_rows.append([])
    
    # Add summary
    data_rows.append(["Summary"])
    data_rows.append([analysis.summary])
    data_rows.append([])
    
    # Add key takeaways
    if analysis.key_takeaways is not None:
        data_rows.append(["Key Takeaways"])
        for takeaway in analysis.key_takeaways:
            data_rows.append([takeaway])
        data_rows.append([])
    
    # Add risk assessment
    if analysis.risk_assessment is not None:
        data_rows.append(["Risk Assessment"])
        data_rows.append([analysis.risk_assessment])
        data_rows.append([])
    
    # Add growth analysis
    if analysis.growth_analysis is not None:
        data_rows.append(["Growth Analysis"])
        data_rows.append([analysis.growth_analysis])
        data_rows.append([])
    
    # Add liquidity analysis
    if analysis.liquidity_analysis is not None:
        data_rows.append(["Liquidity Analysis"])
        data_rows.append([analysis.liquidity_analysis])
    
    # Convert to CSV string
    output = io.StringIO()
    for row in data_rows:
        output.write(','.join([f'"{str(cell)}"' for cell in row]) + '\n')
    
    return output.getvalue()


def export_financial_data_simple_csv(financial_report: FinancialReport) -> str:
    """Export only US-GAAP financial data in simple format: Year as column header, line items as rows"""
    data_rows = []
    
    # Get the year from the period
    year = financial_report.period
    
    # Add header with year as column
    data_rows.append(["Line Item", year])
    data_rows.append([])
    
    def filter_us_gaap(items: dict) -> dict:
        return {k: v for k, v in items.items() if k.lower().startswith('us-gaap')}
    
    # INCOME STATEMENT - Follows logical flow from revenue to net income
    if financial_report.income_statement is not None:
        data_rows.append(["INCOME STATEMENT"])
        us_gaap_income = filter_us_gaap(cast(dict, financial_report.income_statement))
        
        # Logical income statement flow
        income_statement_sections = [
            # Revenue section
            {
                'title': 'REVENUES',
                'keywords': ['revenue', 'sales', 'income from contract', 'net sales']
            },
            # Cost of goods sold section  
            {
                'title': 'COST OF REVENUE',
                'keywords': ['cost of goods', 'cost of revenue', 'cost of sales', 'cost of services']
            },
            # Gross profit (calculated)
            {
                'title': 'GROSS PROFIT',
                'keywords': ['gross profit']
            },
            # Operating expenses section
            {
                'title': 'OPERATING EXPENSES',
                'keywords': ['research and development', 'rd', 'research', 'selling and marketing', 
                           'marketing', 'advertising', 'general and administrative', 'g&a', 'administrative',
                           'operating expenses', 'total operating expenses']
            },
            # Operating income
            {
                'title': 'OPERATING INCOME',
                'keywords': ['operating income', 'operating profit', 'ebit', 'earnings before interest and taxes', 'income from operations']
            },
            # Other income/expenses
            {
                'title': 'OTHER INCOME (EXPENSE)',
                'keywords': ['interest income', 'interest revenue', 'interest expense', 'interest',
                           'other income', 'other expense', 'gain', 'loss', 'non-operating', 'nonoperating', 'non operating']
            },
            # Income before taxes
            {
                'title': 'INCOME BEFORE TAXES',
                'keywords': ['income before taxes', 'pretax income', 'income from continuing operations']
            },
            # Income tax
            {
                'title': 'INCOME TAX EXPENSE',
                'keywords': ['income tax', 'tax expense', 'taxes', 'provision for income taxes']
            },
            # Per share data
            {
                'title': 'PER SHARE DATA',
                'keywords': ['earnings per share', 'eps', 'basic eps', 'diluted eps']
            },
            # Shares outstanding
            {
                'title': 'SHARES OUTSTANDING',
                'keywords': ['shares outstanding', 'weighted average shares', 'basic shares', 'diluted shares']
            },
            # Net income (moved to end)
            {
                'title': 'NET INCOME',
                'keywords': ['net income', 'net earnings', 'net profit', 'net income loss']
            }
        ]
        
        organized_income = organize_financial_items_by_sections(us_gaap_income, income_statement_sections)
        for item in organized_income:
            data_rows.append(item)
        data_rows.append([])
    
    # BALANCE SHEET - Follows Assets = Liabilities + Equity structure
    if financial_report.balance_sheet is not None:
        data_rows.append(["BALANCE SHEET"])
        us_gaap_balance = filter_us_gaap(cast(dict, financial_report.balance_sheet))
        
        # Logical balance sheet flow
        balance_sheet_sections = [
            # Assets section
            {
                'title': 'ASSETS',
                'keywords': ['total assets']
            },
            {
                'title': 'CURRENT ASSETS',
                'keywords': ['current assets', 'cash and cash equivalents', 'cash', 'short term investments',
                           'marketable securities', 'accounts receivable', 'receivables', 'inventory',
                           'prepaid expenses', 'prepaid', 'other current assets']
            },
            {
                'title': 'NON-CURRENT ASSETS',
                'keywords': ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets',
                           'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets']
            },
            # Liabilities section
            {
                'title': 'LIABILITIES',
                'keywords': ['total liabilities']
            },
            {
                'title': 'CURRENT LIABILITIES',
                'keywords': ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities',
                           'accrued expenses', 'short term debt', 'current debt', 'other current liabilities']
            },
            {
                'title': 'NON-CURRENT LIABILITIES',
                'keywords': ['non current liabilities', 'long term debt', 'long term borrowings',
                           'deferred tax liabilities', 'other liabilities']
            },
            # Equity section
            {
                'title': 'SHAREHOLDERS\' EQUITY',
                'keywords': ['total equity', 'stockholders equity', 'shareholders equity', 'common stock',
                           'capital stock', 'additional paid in capital', 'paid in capital',
                           'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity',
                           'comprehensive income', 'accumulated other comprehensive income']
            }
        ]
        
        organized_balance = organize_financial_items_by_sections(us_gaap_balance, balance_sheet_sections)
        for item in organized_balance:
            data_rows.append(item)
        data_rows.append([])
    
    # CASH FLOW STATEMENT - Follows Operating → Investing → Financing flow
    if financial_report.cash_flow is not None:
        data_rows.append(["CASH FLOW STATEMENT"])
        us_gaap_cash = filter_us_gaap(cast(dict, financial_report.cash_flow))
        
        # Logical cash flow statement flow
        cash_flow_sections = [
            # Cash and cash equivalents (appears first)
            {
                'title': 'CASH AND CASH EQUIVALENTS',
                'keywords': ['cash and cash equivalents', 'cash', 'cash equivalents']
            },
            # Operating activities
            {
                'title': 'OPERATING ACTIVITIES',
                'keywords': ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation',
                           'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory',
                           'accounts payable', 'other operating activities', 'net cash from operating activities']
            },
            # Investing activities
            {
                'title': 'INVESTING ACTIVITIES',
                'keywords': ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions',
                           'investments', 'other investing activities', 'net cash from investing activities']
            },
            # Financing activities
            {
                'title': 'FINANCING ACTIVITIES',
                'keywords': ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance',
                           'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid',
                           'other financing activities', 'net cash from financing activities']
            },
            # Net change and ending cash
            {
                'title': 'NET CHANGE IN CASH',
                'keywords': ['net change in cash', 'cash at beginning of period', 'cash at end of period']
            }
        ]
        
        organized_cash_flow = organize_financial_items_by_sections(us_gaap_cash, cash_flow_sections)
        for item in organized_cash_flow:
            data_rows.append(item)
    
    # Convert to CSV string
    output = io.StringIO()
    for row in data_rows:
        output.write(','.join([f'"{str(cell)}"' for cell in row]) + '\n')
    
    return output.getvalue()


def organize_financial_items_by_sections(items: Dict[str, Any], sections: List[Dict[str, Any]]) -> List[List[str]]:
    """Organize financial items according to logical financial statement sections"""
    organized_items = []
    used_concepts = set()
    
    # Process each section in order
    for section in sections:
        section_title = section['title']
        section_keywords = section['keywords']
        
        # Add section header
        organized_items.append([section_title])
        
        # Find items that match this section's keywords
        section_items = []
        for concept, data in items.items():
            if isinstance(data, dict) and concept not in used_concepts:
                label = data.get('label', concept)
                if label:
                    label = label.lower()
                value = data.get('value', '')
                
                # Check if this item matches any keyword in the section
                matches_section = False
                if label:
                    if section_title == 'OPERATING INCOME':
                        # For operating income, be more specific to avoid matching "nonoperating"
                        matches_section = (
                            ('operating income' in label and 'operating income' in section_keywords) or
                            ('operating profit' in label and 'operating profit' in section_keywords) or
                            ('ebit' in label and 'ebit' in section_keywords) or
                            ('earnings before interest and taxes' in label and 'earnings before interest and taxes' in section_keywords) or
                            ('income from operations' in label and 'income from operations' in section_keywords)
                        ) and 'nonoperating' not in label and 'non-operating' not in label
                    elif section_title == 'NET INCOME':
                        # For net income, be very specific to avoid matching other income items
                        matches_section = (
                            ('net income' in label and 'net income' in section_keywords) or
                            ('net earnings' in label and 'net earnings' in section_keywords) or
                            ('net profit' in label and 'net profit' in section_keywords) or
                            ('net income loss' in label and 'net income loss' in section_keywords)
                        ) and 'operating income' not in label and 'other income' not in label
                    elif section_title == 'OTHER INCOME (EXPENSE)':
                        # For other income, exclude net income items
                        matches_section = any(keyword in label for keyword in section_keywords) and 'net income' not in label and 'net earnings' not in label and 'net profit' not in label
                    else:
                        # For other sections, use the original logic
                        matches_section = any(keyword in label for keyword in section_keywords)
                
                if matches_section:
                    # Format value with commas for large numbers
                    if isinstance(value, (int, float)):
                        formatted_value = f"{value:,}"
                    else:
                        formatted_value = str(value)
                    section_items.append([data.get('label', concept), formatted_value])
                    used_concepts.add(concept)
        
        # Add section items (sorted by label for consistency)
        section_items.sort(key=lambda x: x[0].lower())
        organized_items.extend(section_items)
        
        # Add blank line after section (except for last section)
        if section != sections[-1]:
            organized_items.append([])
    
    # Add any remaining uncategorized items at the end
    remaining_items = []
    for concept, data in items.items():
        if isinstance(data, dict) and concept not in used_concepts:
            value = data.get('value', '')
            label = data.get('label', concept)
            # Ensure label is not None
            if label is None:
                label = concept
            # Format value with commas for large numbers
            if isinstance(value, (int, float)):
                formatted_value = f"{value:,}"
            else:
                formatted_value = str(value)
            remaining_items.append([label, formatted_value])
    
    if remaining_items:
        organized_items.append([])
        organized_items.append(["OTHER ITEMS"])
        remaining_items.sort(key=lambda x: (x[0] or '').lower())
        organized_items.extend(remaining_items)
    
    return organized_items


def organize_financial_items(items: Dict[str, Any], standard_order: List[List[str]]) -> List[List[str]]:
    """Organize financial items according to standard statement order"""
    organized_items = []
    used_concepts = set()
    
    # First, add items in standard order
    for keyword_group in standard_order:
        for concept, data in items.items():
            if isinstance(data, dict):
                label = data.get('label', concept)
                if label:
                    label = label.lower()
                value = data.get('value', '')
                
                # Check if this item matches any keyword in the group
                if label and any(keyword in label for keyword in keyword_group):
                    if concept not in used_concepts:
                        # Format value with commas for large numbers
                        if isinstance(value, (int, float)):
                            formatted_value = f"{value:,}"
                        else:
                            formatted_value = str(value)
                        organized_items.append([data.get('label', concept), formatted_value])
                        used_concepts.add(concept)
    
    # Add any remaining items that weren't categorized
    for concept, data in items.items():
        if isinstance(data, dict) and concept not in used_concepts:
            value = data.get('value', '')
            label = data.get('label', concept)
            # Format value with commas for large numbers
            if isinstance(value, (int, float)):
                formatted_value = f"{value:,}"
            else:
                formatted_value = str(value)
            organized_items.append([label, formatted_value])
    
    return organized_items 