import requests
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
import time
from config import settings
from schemas.sec_data import SECCompanyFacts, SECSubmissions, SECValue
from services.xbrl_parser import XBRLParser


class SECService:
    def __init__(self):
        self.base_url = settings.SEC_API_BASE_URL
        self.session = requests.Session()
        # SEC requires proper headers for API access
        self.session.headers.update({
            'User-Agent': 'MySECApp/1.0 (test@example.com)',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Host': 'data.sec.gov'
        })
        self.xbrl_parser = XBRLParser()
        
    def GetMultiParsedData(self, ciks: list[str], years: list[str]) -> dict:
    
        def fetch_and_parse_single_company(cik: str, years: list[str]) -> dict:
            """Parse data for a single company"""
            url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik.zfill(10)}.json"
            headers = {"User-Agent": "Financial Analysis Tool contact@example.com"}
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            
            company_facts = response.json()
            us_gaap = company_facts["facts"]["us-gaap"]
            
            # Helper to extract yearly data
            def extract_data(gaap_name):
                if gaap_name not in us_gaap or "USD" not in us_gaap[gaap_name].get("units", {}):
                    return {}
                
                yearly = {}
                for entry in us_gaap[gaap_name]["units"]["USD"]:
                    if entry.get("form") in ["10-K", "10-K/A"] and entry.get("fy"):
                        year = str(entry["fy"])
                        if year in years:
                            yearly[year] = entry.get("val")
                return yearly        
            
            income_statement_sections = [
                {'title': 'REVENUES', 'keywords': ['revenue', 'sales', 'income from contract', 'net sales']},
                {'title': 'COST OF REVENUE', 'keywords': ['cost of goods', 'cost of revenue', 'cost of sales', 'cost of services']},
                {'title': 'GROSS PROFIT', 'keywords': ['gross profit']},
                {'title': 'OPERATING EXPENSES', 'keywords': ['research and development', 'rd', 'research', 'selling and marketing', 'marketing', 'advertising', 'general and administrative', 'g&a', 'administrative', 'operating expenses', 'total operating expenses']},
                {'title': 'OPERATING INCOME', 'keywords': ['operating income', 'operating profit', 'ebit', 'earnings before interest and taxes', 'income from operations']},
                {'title': 'OTHER INCOME (EXPENSE)', 'keywords': ['interest income', 'interest revenue', 'interest expense', 'interest', 'other income', 'other expense', 'gain', 'loss', 'non-operating', 'nonoperating', 'non operating']},
                {'title': 'INCOME BEFORE TAXES', 'keywords': ['income before taxes', 'pretax income', 'income from continuing operations']},
                {'title': 'INCOME TAX EXPENSE', 'keywords': ['income tax', 'tax expense', 'taxes', 'provision for income taxes']},
                {'title': 'PER SHARE DATA', 'keywords': ['earnings per share', 'eps', 'basic eps', 'diluted eps']},
                {'title': 'SHARES OUTSTANDING', 'keywords': ['shares outstanding', 'weighted average shares', 'basic shares', 'diluted shares']},
                {'title': 'NET INCOME', 'keywords': ['net income', 'net earnings', 'net profit', 'net income loss']}
            ]

            balance_sheet_sections = [
                {'title': 'ASSETS', 'keywords': ['total assets']},
                {'title': 'CURRENT ASSETS', 'keywords': ['current assets', 'cash and cash equivalents', 'cash', 'short term investments', 'marketable securities', 'accounts receivable', 'receivables', 'inventory', 'prepaid expenses', 'prepaid', 'other current assets']},
                {'title': 'NON-CURRENT ASSETS', 'keywords': ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets', 'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets']},
                {'title': 'LIABILITIES', 'keywords': ['total liabilities']},
                {'title': 'CURRENT LIABILITIES', 'keywords': ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities', 'accrued expenses', 'short term debt', 'current debt', 'other current liabilities']},
                {'title': 'NON-CURRENT LIABILITIES', 'keywords': ['non current liabilities', 'long term debt', 'long term borrowings', 'deferred tax liabilities', 'other liabilities']},
                {'title': 'SHAREHOLDERS\' EQUITY', 'keywords': ['total equity', 'stockholders equity', 'shareholders equity', 'common stock', 'capital stock', 'additional paid in capital', 'paid in capital', 'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity', 'comprehensive income', 'accumulated other comprehensive income']}
            ]

            cash_flow_sections = [
                {'title': 'CASH AND CASH EQUIVALENTS', 'keywords': ['cash and cash equivalents', 'cash', 'cash equivalents']},
                {'title': 'OPERATING ACTIVITIES', 'keywords': ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation', 'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory', 'accounts payable', 'other operating activities', 'net cash from operating activities']},
                {'title': 'INVESTING ACTIVITIES', 'keywords': ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions', 'investments', 'other investing activities', 'net cash from investing activities']},
                {'title': 'FINANCING ACTIVITIES', 'keywords': ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance', 'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid', 'other financing activities', 'net cash from financing activities']},
                {'title': 'NET CHANGE IN CASH', 'keywords': ['net change in cash', 'cash at beginning of period', 'cash at end of period']}
            ]

            def categorize_item(label, gaap_name, sections):
                search_text = ((label or "") + ' ' + (gaap_name or "")).lower()
    
                for section in sections:
                    for keyword in section['keywords']:
                        if keyword.lower() in search_text:
                            return section['title']
                return None
            
            categorized_data = {
                'income_statement': {},
                'balance_sheet': {},
                'cash_flow': {}
            }        

            for section in income_statement_sections:
                categorized_data['income_statement'][section['title']] = []
            for section in balance_sheet_sections:
                categorized_data['balance_sheet'][section['title']] = []
            for section in cash_flow_sections:
                categorized_data['cash_flow'][section['title']] = []        
            
            for gaap_name in us_gaap.keys():
                
                data = extract_data(gaap_name)
                values = {year: None for year in years}
                values.update(data)
                label = us_gaap[gaap_name].get("label", gaap_name)
                
                item = {
                    "type": label,
                    "gaap_name": gaap_name,
                    "values": values
                }           
                
                section = categorize_item(label, gaap_name, income_statement_sections)
                if section:
                    categorized_data['income_statement'][section].append(item)
                    continue
                
                section = categorize_item(label, gaap_name, balance_sheet_sections)
                if section:
                    categorized_data['balance_sheet'][section].append(item)
                    continue
                
                section = categorize_item(label, gaap_name, cash_flow_sections)
                if section:
                    categorized_data['cash_flow'][section].append(item)
            
            statements = categorized_data
            
            return {
                "company": {
                    "name": company_facts.get("entityName"),
                    "cik": company_facts.get("cik")
                },
                "years": years,
                "statements": statements
            }
        
        # Process all companies
        result = {
            "companies": [],
            "years": years,
            "summary": {
                "total_companies": len(ciks),
                "companies_processed": 0,
                "errors": []
            }
        }
        
        for cik in ciks:
            try:
                company_data = fetch_and_parse_single_company(cik, years)
                result["companies"].append(company_data)
                result["summary"]["companies_processed"] += 1
            except Exception as e:
                result["summary"]["errors"].append({
                    "cik": cik,
                    "error": str(e)
                })
        
        return result
    
    def GetParsedData(self, cik: str, years: list[str]) -> dict:
        
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik.zfill(10)}.json"
        headers = {"User-Agent": "Financial Analysis Tool contact@example.com"}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        company_facts = response.json()
        us_gaap = company_facts["facts"]["us-gaap"]
        
        # Helper to extract yearly data
        def extract_data(gaap_name):
            if gaap_name not in us_gaap or "USD" not in us_gaap[gaap_name].get("units", {}):
                return {}
            
            yearly = {}
            for entry in us_gaap[gaap_name]["units"]["USD"]:
                if entry.get("form") in ["10-K", "10-K/A"] and entry.get("fy"):
                    year = str(entry["fy"])
                    if year in years:
                        yearly[year] = entry.get("val")
            return yearly        
        
        income_statement_sections = [
            {'title': 'REVENUES', 'keywords': ['revenue', 'sales', 'income from contract', 'net sales']},
            {'title': 'COST OF REVENUE', 'keywords': ['cost of goods', 'cost of revenue', 'cost of sales', 'cost of services']},
            {'title': 'GROSS PROFIT', 'keywords': ['gross profit']},
            {'title': 'OPERATING EXPENSES', 'keywords': ['research and development', 'rd', 'research', 'selling and marketing', 'marketing', 'advertising', 'general and administrative', 'g&a', 'administrative', 'operating expenses', 'total operating expenses']},
            {'title': 'OPERATING INCOME', 'keywords': ['operating income', 'operating profit', 'ebit', 'earnings before interest and taxes', 'income from operations']},
            {'title': 'OTHER INCOME (EXPENSE)', 'keywords': ['interest income', 'interest revenue', 'interest expense', 'interest', 'other income', 'other expense', 'gain', 'loss', 'non-operating', 'nonoperating', 'non operating']},
            {'title': 'INCOME BEFORE TAXES', 'keywords': ['income before taxes', 'pretax income', 'income from continuing operations']},
            {'title': 'INCOME TAX EXPENSE', 'keywords': ['income tax', 'tax expense', 'taxes', 'provision for income taxes']},
            {'title': 'PER SHARE DATA', 'keywords': ['earnings per share', 'eps', 'basic eps', 'diluted eps']},
            {'title': 'SHARES OUTSTANDING', 'keywords': ['shares outstanding', 'weighted average shares', 'basic shares', 'diluted shares']},
            {'title': 'NET INCOME', 'keywords': ['net income', 'net earnings', 'net profit', 'net income loss']}
        ]

        balance_sheet_sections = [
            {'title': 'ASSETS', 'keywords': ['total assets']},
            {'title': 'CURRENT ASSETS', 'keywords': ['current assets', 'cash and cash equivalents', 'cash', 'short term investments', 'marketable securities', 'accounts receivable', 'receivables', 'inventory', 'prepaid expenses', 'prepaid', 'other current assets']},
            {'title': 'NON-CURRENT ASSETS', 'keywords': ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets', 'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets']},
            {'title': 'LIABILITIES', 'keywords': ['total liabilities']},
            {'title': 'CURRENT LIABILITIES', 'keywords': ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities', 'accrued expenses', 'short term debt', 'current debt', 'other current liabilities']},
            {'title': 'NON-CURRENT LIABILITIES', 'keywords': ['non current liabilities', 'long term debt', 'long term borrowings', 'deferred tax liabilities', 'other liabilities']},
            {'title': 'SHAREHOLDERS\' EQUITY', 'keywords': ['total equity', 'stockholders equity', 'shareholders equity', 'common stock', 'capital stock', 'additional paid in capital', 'paid in capital', 'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity', 'comprehensive income', 'accumulated other comprehensive income']}
        ]

        cash_flow_sections = [
            {'title': 'CASH AND CASH EQUIVALENTS', 'keywords': ['cash and cash equivalents', 'cash', 'cash equivalents']},
            {'title': 'OPERATING ACTIVITIES', 'keywords': ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation', 'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory', 'accounts payable', 'other operating activities', 'net cash from operating activities']},
            {'title': 'INVESTING ACTIVITIES', 'keywords': ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions', 'investments', 'other investing activities', 'net cash from investing activities']},
            {'title': 'FINANCING ACTIVITIES', 'keywords': ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance', 'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid', 'other financing activities', 'net cash from financing activities']},
            {'title': 'NET CHANGE IN CASH', 'keywords': ['net change in cash', 'cash at beginning of period', 'cash at end of period']}
        ]

        def categorize_item(label, gaap_name, sections):
            search_text = (label + ' ' + gaap_name).lower()
            
            for section in sections:
                for keyword in section['keywords']:
                    if keyword.lower() in search_text:
                        return section['title']
            return None
        
        categorized_data = {
            'income_statement': {},
            'balance_sheet': {},
            'cash_flow': {}
        }        

        for section in income_statement_sections:
            categorized_data['income_statement'][section['title']] = []
        for section in balance_sheet_sections:
            categorized_data['balance_sheet'][section['title']] = []
        for section in cash_flow_sections:
            categorized_data['cash_flow'][section['title']] = []        
        
        for gaap_name in us_gaap.keys():
            data = extract_data(gaap_name)
            if not data:
                continue
            
            label = us_gaap[gaap_name].get("label", gaap_name)
            item = {
                "type": label,
                "gaap_name": gaap_name,
                "values": data
            }           
            
            section = categorize_item(label, gaap_name, income_statement_sections)
            if section:
                categorized_data['income_statement'][section].append(item)
                continue
            
            section = categorize_item(label, gaap_name, balance_sheet_sections)
            if section:
                categorized_data['balance_sheet'][section].append(item)
                continue
            
            section = categorize_item(label, gaap_name, cash_flow_sections)
            if section:
                categorized_data['cash_flow'][section].append(item)
        
        statements = categorized_data
        
        return {
            "company": {
                "name": company_facts.get("entityName"),
                "cik": company_facts.get("cik")
            },
            "years": years,
            "statements": statements
        }

    def GetParsedData(self, cik: str, years: list[str]) -> dict:
        
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik.zfill(10)}.json"
        headers = {"User-Agent": "Financial Analysis Tool contact@example.com"}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        company_facts = response.json()
        us_gaap = company_facts["facts"]["us-gaap"]
        
        # Helper to extract yearly data
        def extract_data(gaap_name):
            if gaap_name not in us_gaap or "USD" not in us_gaap[gaap_name].get("units", {}):
                return {}
            
            yearly = {}
            for entry in us_gaap[gaap_name]["units"]["USD"]:
                if entry.get("form") in ["10-K", "10-K/A"] and entry.get("fy"):
                    year = str(entry["fy"])
                    if year in years:
                        yearly[year] = entry.get("val")
            return yearly        
        
        income_statement_sections = [
            {'title': 'REVENUES', 'keywords': ['revenue', 'sales', 'income from contract', 'net sales']},
            {'title': 'COST OF REVENUE', 'keywords': ['cost of goods', 'cost of revenue', 'cost of sales', 'cost of services']},
            {'title': 'GROSS PROFIT', 'keywords': ['gross profit']},
            {'title': 'OPERATING EXPENSES', 'keywords': ['research and development', 'rd', 'research', 'selling and marketing', 'marketing', 'advertising', 'general and administrative', 'g&a', 'administrative', 'operating expenses', 'total operating expenses']},
            {'title': 'OPERATING INCOME', 'keywords': ['operating income', 'operating profit', 'ebit', 'earnings before interest and taxes', 'income from operations']},
            {'title': 'OTHER INCOME (EXPENSE)', 'keywords': ['interest income', 'interest revenue', 'interest expense', 'interest', 'other income', 'other expense', 'gain', 'loss', 'non-operating', 'nonoperating', 'non operating']},
            {'title': 'INCOME BEFORE TAXES', 'keywords': ['income before taxes', 'pretax income', 'income from continuing operations']},
            {'title': 'INCOME TAX EXPENSE', 'keywords': ['income tax', 'tax expense', 'taxes', 'provision for income taxes']},
            {'title': 'PER SHARE DATA', 'keywords': ['earnings per share', 'eps', 'basic eps', 'diluted eps']},
            {'title': 'SHARES OUTSTANDING', 'keywords': ['shares outstanding', 'weighted average shares', 'basic shares', 'diluted shares']},
            {'title': 'NET INCOME', 'keywords': ['net income', 'net earnings', 'net profit', 'net income loss']}
        ]

        balance_sheet_sections = [
            {'title': 'ASSETS', 'keywords': ['total assets']},
            {'title': 'CURRENT ASSETS', 'keywords': ['current assets', 'cash and cash equivalents', 'cash', 'short term investments', 'marketable securities', 'accounts receivable', 'receivables', 'inventory', 'prepaid expenses', 'prepaid', 'other current assets']},
            {'title': 'NON-CURRENT ASSETS', 'keywords': ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets', 'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets']},
            {'title': 'LIABILITIES', 'keywords': ['total liabilities']},
            {'title': 'CURRENT LIABILITIES', 'keywords': ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities', 'accrued expenses', 'short term debt', 'current debt', 'other current liabilities']},
            {'title': 'NON-CURRENT LIABILITIES', 'keywords': ['non current liabilities', 'long term debt', 'long term borrowings', 'deferred tax liabilities', 'other liabilities']},
            {'title': 'SHAREHOLDERS\' EQUITY', 'keywords': ['total equity', 'stockholders equity', 'shareholders equity', 'common stock', 'capital stock', 'additional paid in capital', 'paid in capital', 'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity', 'comprehensive income', 'accumulated other comprehensive income']}
        ]

        cash_flow_sections = [
            {'title': 'CASH AND CASH EQUIVALENTS', 'keywords': ['cash and cash equivalents', 'cash', 'cash equivalents']},
            {'title': 'OPERATING ACTIVITIES', 'keywords': ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation', 'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory', 'accounts payable', 'other operating activities', 'net cash from operating activities']},
            {'title': 'INVESTING ACTIVITIES', 'keywords': ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions', 'investments', 'other investing activities', 'net cash from investing activities']},
            {'title': 'FINANCING ACTIVITIES', 'keywords': ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance', 'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid', 'other financing activities', 'net cash from financing activities']},
            {'title': 'NET CHANGE IN CASH', 'keywords': ['net change in cash', 'cash at beginning of period', 'cash at end of period']}
        ]

        def categorize_item(label, gaap_name, sections):
            search_text = (label + ' ' + gaap_name).lower()
            
            for section in sections:
                for keyword in section['keywords']:
                    if keyword.lower() in search_text:
                        return section['title']
            return None
        
        categorized_data = {
            'income_statement': {},
            'balance_sheet': {},
            'cash_flow': {}
        }        

        for section in income_statement_sections:
            categorized_data['income_statement'][section['title']] = []
        for section in balance_sheet_sections:
            categorized_data['balance_sheet'][section['title']] = []
        for section in cash_flow_sections:
            categorized_data['cash_flow'][section['title']] = []        
        
        for gaap_name in us_gaap.keys():
            data = extract_data(gaap_name)
            if not data:
                continue
            
            label = us_gaap[gaap_name].get("label", gaap_name)
            item = {
                "type": label,
                "gaap_name": gaap_name,
                "values": data
            }           
            
            section = categorize_item(label, gaap_name, income_statement_sections)
            if section:
                categorized_data['income_statement'][section].append(item)
                continue
            
            section = categorize_item(label, gaap_name, balance_sheet_sections)
            if section:
                categorized_data['balance_sheet'][section].append(item)
                continue
            
            section = categorize_item(label, gaap_name, cash_flow_sections)
            if section:
                categorized_data['cash_flow'][section].append(item)
        
        statements = categorized_data
        
        return {
            "company": {
                "name": company_facts.get("entityName"),
                "cik": company_facts.get("cik")
            },
            "years": years,
            "statements": statements
        }
    
    def search_companies(self, query: str) -> List[Dict[str, Any]]:
        """Search for companies by ticker or name"""
        try:
            # Use SEC's company tickers endpoint
            url = "https://www.sec.gov/files/company_tickers.json"
            
            # Use correct headers for www.sec.gov
            headers = {
                'User-Agent': 'MySECApp/1.0 (test@example.com)',
                'Accept': 'application/json'
            }
            
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            
            companies_data = response.json()
            results = []
            
            query_lower = query.lower()
            for cik, company_info in companies_data.items():
                ticker = company_info.get('ticker', '').lower()
                name = company_info.get('title', '').lower()
                
                if query_lower in ticker or query_lower in name:
                    results.append({
                        'cik': str(company_info.get('cik_str', '')),
                        'ticker': company_info.get('ticker', ''),
                        'company_name': company_info.get('title', ''),
                        'sic': company_info.get('sic', ''),
                        'industry': company_info.get('sicDescription', '')
                    })
                
                if len(results) >= 10:  # Limit results
                    break
            
            return results
            
        except Exception as e:
            print(f"Error searching companies: {e}")
            return []
    
    def get_company_filings(self, cik: str, report_type: str | None = None) -> List[Dict[str, Any]]:
        """Get company filings from SEC for a  - this is just getting the actual filings"""
        try:
            # Pad CIK with zeros to 10 digits
            cik_padded = cik.zfill(10)
            
            # Try multiple SEC endpoints
            endpoints = [
                f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik_padded}.json",
                f"https://data.sec.gov/submissions/CIK{cik_padded}.json",
                f"https://data.sec.gov/api/xbrl/company_concept/CIK{cik_padded}/us-gaap/Revenues.json"
            ]
            
            for url in endpoints:
                try:
                    response = self.session.get(url)
                    if response.status_code == 200:
                        # Add delay to respect SEC rate limits
                        time.sleep(0.1)
                        return response.json()
                    elif response.status_code == 404:
                        print(f"Endpoint not found: {url}")
                        continue
                    else:
                        print(f"Unexpected status code {response.status_code} for {url}")
                        continue
                except Exception as e:
                    print(f"Error trying endpoint {url}: {e}")
                    continue
            
            print(f"No working endpoints found for CIK {cik}")
            return []
            
        except Exception as e:
            print(f"Error getting company filings: {e}")
            return []
    
    def get_financial_statements(self, cik: str, report_type: str, period: str) -> Dict[str, Any]:
        """Get financial statements for a specific period - this is the main function that gets the financial statements (one company, one period)"""
        try:
            cik_padded = cik.zfill(10)
            
            # First try XBRL parsing (most accurate)
            print("🔍 Trying XBRL parsing...")
            xbrl_data = self.get_financial_statements_xbrl(cik, report_type, period)
            
            if xbrl_data and xbrl_data.get('financial_statements'):
                print("✅ Using XBRL parsed data")
                return xbrl_data
            
            # Fallback to filing-specific data extraction
            print("📄 Falling back to filing-specific data extraction...")
            filing_data = self.get_reported_concepts_from_filing(cik, report_type, period)
            
            if filing_data and filing_data.get('reported_concepts'):
                print("✅ Using filing-specific data")
                # Create a data structure that matches what _extract_financial_data expects
                data = {'facts': filing_data['reported_concepts']}
                return self._extract_financial_data(data, report_type, period)
            
            # Final fallback to company facts data
            print("📄 Falling back to company facts data...")
            
            # Try multiple SEC endpoints
            endpoints = [
                f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik_padded}.json",
                f"https://data.sec.gov/submissions/CIK{cik_padded}.json",
                f"https://data.sec.gov/api/xbrl/company_concept/CIK{cik_padded}/us-gaap/Revenues.json"
            ]
            
            for url in endpoints:
                try:
                    response = self.session.get(url)
                    if response.status_code == 200:
                        data = response.json()  # This is 'data' parameter in extract_financial_statements method
                        print(f"✅ Got data from: {url}")
                        print(f"📊 Data keys: {list(data.keys())}")
                        
                        # Extract financial data based on report type and period
                        financial_data = self._extract_financial_data(data, report_type, period)
                        print("Here");
                        return financial_data
                    elif response.status_code == 404:
                        print(f"❌ Endpoint not found: {url}")
                        continue
                    else:
                        print(f"⚠️ Status {response.status_code} for {url}")
                        continue
                except Exception as e:
                    print(f"❌ Error with {url}: {e}")
                    continue
            
            print(f"❌ No working endpoints found for CIK {cik}")
            return {}
            
        except Exception as e:
            print(f"❌ Error getting financial statements: {e}")
            return {}
        

    def ParseStatements(self, cik: str, report_type: str, period: str, filings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get financial statements using XBRL parsing - most accurate method"""
        try:

            if not filings:
                print("❌ No filings found for XBRL parsing")
                return {}
            
            # Look for the specific report type and period
            target_accession = None
            for filing in filings:
                if isinstance(filing, dict):
                    filing_type = filing.get('form', '')
                    filing_date = filing.get('filingDate', '')
                    
                    # Check if this filing matches our criteria
                    if (report_type.lower() in filing_type.lower() and 
                        str(period) in filing_date):
                        target_accession = filing.get('accessionNumber')
                        break
            
            if not target_accession:
                print(f"❌ No {report_type} filing found for period {period}")
                return {}
            
            print(f"✅ Found target filing: {target_accession}")
            
            # Use XBRL parser to get financial statements
            xbrl_data = self.xbrl_parser.get_financial_statements_xbrl(cik, target_accession)
            
            if xbrl_data:
                print("✅ Successfully parsed XBRL data")
                return xbrl_data
            else:
                print("❌ XBRL parsing failed")
                return {}
                
        except Exception as e:
            print(f"❌ Error in XBRL parsing: {e}")
            return {}




    
    def get_financial_statements_xbrl(self, cik: str, report_type: str, period: str) -> Dict[str, Any]:
        """Get financial statements using XBRL parsing - most accurate method"""
        try:
            # Get company filings to find the right accession number
            filings = self.get_company_filings(cik)
            
            if not filings:
                print("❌ No filings found for XBRL parsing")
                return {}
            
            # Look for the specific report type and period
            target_accession = None
            for filing in filings:
                if isinstance(filing, dict):
                    filing_type = filing.get('form', '')
                    filing_date = filing.get('filingDate', '')
                    
                    # Check if this filing matches our criteria
                    if (report_type.lower() in filing_type.lower() and 
                        str(period) in filing_date):
                        target_accession = filing.get('accessionNumber')
                        break
            
            if not target_accession:
                print(f"❌ No {report_type} filing found for period {period}")
                return {}
            
            print(f"✅ Found target filing: {target_accession}")
            
            # Use XBRL parser to get financial statements
            xbrl_data = self.xbrl_parser.get_financial_statements_xbrl(cik, target_accession)
            
            if xbrl_data:
                print("✅ Successfully parsed XBRL data")
                return xbrl_data
            else:
                print("❌ XBRL parsing failed")
                return {}
                
        except Exception as e:
            print(f"❌ Error in XBRL parsing: {e}")
            return {}
    
    def _extract_financial_data(self, data: Dict[str, Any], report_type: str, period: str) -> Dict[str, Any]:
        """Extract financial data using company's actual labels"""
        financial_data = {
            'income_statement': {},
            'balance_sheet': {},
            'cash_flow': {},
            'raw_data': data
        }
        
        try:
            # Check if this is XBRL company facts data
            if 'facts' in data:
                facts = data.get('facts', {})
                print(f"🔍 Found facts with keys: {list(facts.keys())}")
                
                # Handle nested structure: facts contains 'dei', 'us-gaap', etc.
                all_concepts = {}
                all_labels = []  # Collect all label names for debugging
                reported_concepts = {}  # Only concepts with actual values
                
                for category, category_data in facts.items():
                    if isinstance(category_data, dict):
                        for concept_name, concept_data in category_data.items():
                            # Use category.concept_name as the full key
                            full_concept_name = f"{category}.{concept_name}"
                            all_concepts[full_concept_name] = concept_data
                            
                            # Extract label for debugging
                            label = concept_data.get('label', concept_name)
                            all_labels.append({
                                'concept': full_concept_name,
                                'label': label
                            })
                            
                            # Check if this concept has values for the requested period
                            if 'units' in concept_data:
                                has_reported_value = False
                                for unit_key, values in concept_data['units'].items():
                                    for value in values:
                                        value_form = value.get('form')
                                        value_end = value.get('end', '')
                                        value_fy = value.get('fy')
                                        value_fp = value.get('fp', '')
                                        
                                        # More precise matching:
                                        # 1. Form must match exactly
                                        # 2. End date must contain the requested year
                                        # 3. Fiscal period should be FY, Q4 (annual) or Q1-Q4 (quarterly)
                                        # 4. Value should not be null/empty
                                        if (value_form == report_type and 
                                            value_end and str(period) in value_end and
                                            (value_fp == 'FY' or value_fp == 'Q4' or value_fp == '' or
                                             value_fp in ['Q1', 'Q2', 'Q3', 'Q4']) and
                                            value.get('val') is not None):
                                            has_reported_value = True
                                            break
                                    if has_reported_value:
                                        break
                                
                                if has_reported_value:
                                    reported_concepts[full_concept_name] = concept_data
                
                print(f"📊 Total concepts found: {len(all_concepts)}")
                print(f"📊 Concepts with reported values: {len(reported_concepts)}")
                
                # Use only reported concepts for categorization
                all_concepts = reported_concepts
                
                print(f"📊 Concepts with reported values: {len(reported_concepts)}")
                
                # Debug: Print all label names
                print(f"\n🔍 ALL REPORTED CONCEPTS:")
                print(f"📋 Total labels found: {len(reported_concepts)}")
                print("=" * 80)
                for i, (concept_name, concept_data) in enumerate(reported_concepts.items(), 1):
                    label = concept_data.get('label', concept_name)
                    print(f"{i:3d}. {label}")
                
                print("=" * 80)
                
                # Store all labels in financial_data for reference
                financial_data['all_labels'] = all_labels
                
                # Categorize concepts by statement type using keyword analysis
                categorized_concepts = self._categorize_concepts_by_statement(all_concepts)
                
                # Extract data for each statement type using company's actual labels
                for statement_type, concepts in categorized_concepts.items():
                    for concept_name in concepts:
                        concept_data = all_concepts[concept_name]
                        
                        if 'units' in concept_data:
                            units = concept_data['units']
                            
                            for unit_key, values in units.items():
                                for value in values:
                                    # Enhanced filtering to ensure exact period match
                                    value_fy = value.get('fy')
                                    value_form = value.get('form')
                                    value_fp = value.get('fp', '')
                                    value_end = value.get('end', '')
                                    
                                    # Check if this value matches the requested period exactly
                                    # Use the 'end' date (YYYY-MM-DD format) to determine the fiscal year
                                    period_match = (
                                        value_form == report_type and 
                                        # Check that the end date contains the requested year
                                        (value_end and str(period) in value_end) and
                                        # For annual reports: FY, Q4, or empty
                                        # For quarterly reports: Q1, Q2, Q3, Q4
                                        (value_fp == 'FY' or value_fp == 'Q4' or value_fp == '' or
                                         value_fp in ['Q1', 'Q2', 'Q3', 'Q4'])
                                    )
                                    
                                    if period_match:
                                        # Use the company's actual concept name as the key
                                        financial_data[statement_type][concept_name] = {
                                            'value': value.get('val'),
                                            'unit': unit_key,
                                            'period': value.get('end'),
                                            'fiscal_year': value.get('fy'),
                                            'fiscal_period': value.get('fp'),
                                            'filing_date': value.get('filed'),
                                            'accession_number': value.get('accn'),
                                            'label': concept_data.get('label', concept_name)
                                        }
                                        break
                                else:
                                    continue
                                break
                
                # Include all available concepts for reference
                financial_data['all_concepts'] = list(all_concepts.keys())[:100]  # Limit for readability
            
            # Check if this is submissions data
            elif 'filings' in data:
                print("📄 Processing submissions data...")
                filings = data.get('filings', {})
                recent_filings = filings.get('recent', {})
                
                # Extract filing information
                financial_data['filings'] = {
                    'accessionNumber': recent_filings.get('accessionNumber', []),
                    'form': recent_filings.get('form', []),
                    'filingDate': recent_filings.get('filingDate', []),
                    'reportDate': recent_filings.get('reportDate', [])
                }
                
                # Find matching filing for the requested report type and period
                forms = recent_filings.get('form', [])
                filing_dates = recent_filings.get('filingDate', [])
                accession_numbers = recent_filings.get('accessionNumber', [])
                
                print(f"🔍 Looking for {report_type} filings in {len(forms)} total filings...")
                
                matching_filings = []
                for i, form in enumerate(forms):
                    if form == report_type:
                        filing_info = {
                            'form': form,
                            'filing_date': filing_dates[i] if i < len(filing_dates) else None,
                            'accession_number': accession_numbers[i] if i < len(accession_numbers) else None,
                            'index': i
                        }
                        matching_filings.append(filing_info)
                        print(f"✅ Found {report_type} filing: {filing_info['filing_date']} (Accession: {filing_info['accession_number']})")
                
                if matching_filings:
                    # Use the most recent matching filing
                    latest_filing = matching_filings[0]  # Assuming they're sorted by date
                    print(f"📋 Using filing: {latest_filing['filing_date']}")
                    
                    # Try to get actual financial data from this filing
                    if latest_filing['accession_number']:
                        financial_data = self._get_filing_financial_data(
                            latest_filing['accession_number'], 
                            report_type, 
                            period
                        )
                        if financial_data:
                            print("✅ Successfully extracted financial data from filing")
                            return financial_data
                    
                    # If we can't get filing data, at least return the filing info
                    financial_data['matching_filing'] = latest_filing
                    print("⚠️ Found filing but couldn't extract financial data")
                else:
                    print(f"❌ No {report_type} filings found")
            
            # Check if this is company concept data
            elif 'units' in data:
                units = data.get('units', {})
                for unit_key, values in units.items():
                    for value in values:
                        # Enhanced filtering to ensure exact period match
                        value_fy = value.get('fy')
                        value_form = value.get('form')
                        value_fp = value.get('fp', '')
                        value_end = value.get('end', '')
                        
                        # Check if this value matches the requested period exactly
                        # Use the 'end' date (YYYY-MM-DD format) to determine the fiscal year
                        period_match = (
                            value_form == report_type and 
                            # Check that the end date contains the requested year
                            (value_end and str(period) in value_end) and
                            # For annual reports: FY, Q4, or empty
                            # For quarterly reports: Q1, Q2, Q3, Q4
                            (value_fp == 'FY' or value_fp == 'Q4' or value_fp == '' or
                             value_fp in ['Q1', 'Q2', 'Q3', 'Q4'])
                        )
                        
                        if period_match:
                            financial_data['concept_data'] = {
                                    'value': value.get('val'),
                                    'unit': unit_key,
                                'period': value.get('end'),
                                'fiscal_year': value.get('fy'),
                                'fiscal_period': value.get('fp'),
                                'form': value.get('form'),
                                'filing_date': value.get('filed'),
                                'accession_number': value.get('accn')
                            }
            
            else:
                # Unknown data structure - return raw data
                financial_data['unknown_structure'] = True
                financial_data['available_keys'] = list(data.keys())
            
        except Exception as e:
            print(f"Error extracting financial data: {e}")
            financial_data['error'] = str(e)
        
        return financial_data 

    def _get_filing_financial_data(self, accession_number: str, report_type: str, period: str) -> Dict[str, Any]:
        """Get financial data from a specific filing"""
        try:
            # Try to get the actual filing data
            url = f"https://data.sec.gov/api/xbrl/facts/{accession_number}.json"
            print(f"🔍 Fetching filing data from: {url}")
            
            response = self.session.get(url)
            if response.status_code == 200:
                filing_data = response.json()
                print(f"✅ Got filing data with keys: {list(filing_data.keys())}")
                
                # Process the filing data similar to company facts
                return self._extract_financial_data(filing_data, report_type, period)
            else:
                print(f"❌ Could not fetch filing data: {response.status_code}")
                return {}
            
        except Exception as e:
            print(f"❌ Error fetching filing data: {e}")
            return {}

    def _categorize_concepts_by_statement(self, facts: Dict[str, Any]) -> Dict[str, List[str]]:
        """Categorize company concepts into financial statement types using keyword scoring for all categories"""
        
        categorized = {
            'income_statement': [],
            'balance_sheet': [],
            'cash_flow': []
        }
        
        # Keywords for each statement type - keyword matching
        statement_keywords = {
            'income_statement': [
                'revenue', 'sales', 'income', 'profit', 'loss', 'earnings', 'expense', 'cost',
                'gross', 'operating', 'eps', 'per share', 'research', 'development'
            ],
            'balance_sheet': [
                'asset', 'liability', 'equity', 'cash', 'receivable', 'payable', 'inventory',
                'debt', 'stock', 'capital', 'retained', 'current', 'total', 'shares', 'other comprehensive income',
                'goodwill', 'intangible', 'available for sale'
            ],
            'cash_flow': [
                'cash flow', 'operating activities', 'investing activities', 'financing activities',
                'cash provided', 'cash used', 'payments', 'proceeds', 'capital expenditures', 'proceeds from',
                'payments to', 'payments for repurchases of common stock', 'Increase (Decrease)', 'increase', 'decrease', 'depreciation', 'amortization'
            ]
        }
        
        for concept_name, concept_data in facts.items():
            description = concept_data.get('label') or concept_name or ''
            if description:  # Make sure description is not None
                description = str(description).lower()
            else:
                description = ''
            
            # Special handling for cash flow items with increase/decrease
            if any(keyword.lower() in description for keyword in ['increase', 'decrease']):
                categorized['cash_flow'].append(concept_name)
                print(f"📋 Categorized '{concept_name}' as cash_flow (increase/decrease keyword)")
                continue
            
            # Special handling for comprehensive income items - these belong in balance sheet
            if 'comprehensive income' in description:
                categorized['balance_sheet'].append(concept_name)
                print(f"📋 Categorized '{concept_name}' as balance_sheet (comprehensive income)")
                continue
            
            # Use scoring system for all statement types
            scores = {}
            for statement_type, keywords in statement_keywords.items():
                score = 0
                for keyword in keywords:
                    # Simple keyword matching - check if keyword appears in description
                    if keyword in description:
                        score += 1
                scores[statement_type] = score
            
            # Assign to the statement type with highest score
            if any(scores.values()):
                best_statement = max(scores.keys(), key=lambda k: scores[k])
                if scores[best_statement] > 0:
                    categorized[best_statement].append(concept_name)
                    print(f"📋 Categorized '{concept_name}' as {best_statement} (score: {scores[best_statement]})")
        
        # Print summary
        for statement_type, concepts in categorized.items():
            print(f"📊 {statement_type}: {len(concepts)} concepts")
        
        return categorized 

    def get_reported_concepts_from_filing(self, cik: str, report_type: str, period: str) -> Dict[str, Any]:
        """Get only concepts that are actually reported in a specific filing"""
        try:
            cik_padded = cik.zfill(10)
            
            # First get company submissions to find the right filing
            submissions_url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"
            response = self.session.get(submissions_url)
            
            if response.status_code == 200:
                submissions_data = response.json()
                filings = submissions_data.get('filings', {}).get('recent', {})
                
                # Find the most recent filing of the requested type
                forms = filings.get('form', [])
                accession_numbers = filings.get('accessionNumber', [])
                filing_dates = filings.get('filingDate', [])
                
                target_filing = None
                for i, form in enumerate(forms):
                    if form == report_type:
                        # Check if this filing is from the right period
                        filing_date = filing_dates[i] if i < len(filing_dates) else None
                        if filing_date and str(period) in filing_date:
                            target_filing = {
                                'accession_number': accession_numbers[i] if i < len(accession_numbers) else None,
                                'filing_date': filing_date,
                                'form': form
                            }
                            break
                
                if target_filing and target_filing['accession_number']:
                    # Get the specific filing data
                    filing_url = f"https://data.sec.gov/api/xbrl/facts/{target_filing['accession_number']}.json"
                    filing_response = self.session.get(filing_url)
                    
                    if filing_response.status_code == 200:
                        filing_data = filing_response.json()
                        print(f"✅ Found filing: {target_filing['filing_date']} (Accession: {target_filing['accession_number']})")
                        
                        # Extract only concepts that appear in this filing
                        reported_concepts = {}
                        if 'facts' in filing_data:
                            facts = filing_data['facts']
                            for category, category_data in facts.items():
                                if isinstance(category_data, dict):
                                    for concept_name, concept_data in category_data.items():
                                        full_concept_name = f"{category}.{concept_name}"
                                        
                                        # Only include if it has actual values
                                        if 'units' in concept_data:
                                            has_values = False
                                            for unit_key, values in concept_data['units'].items():
                                                if values:  # Has at least one value
                                                    has_values = True
                                                    break
                                            
                                            if has_values:
                                                reported_concepts[full_concept_name] = concept_data
                        
                        print(f"📊 Concepts actually reported in filing: {len(reported_concepts)}")
                        return {
                            'reported_concepts': reported_concepts,
                            'filing_info': target_filing
                        }
            
            print("❌ Could not find appropriate filing")
            return {}
            
        except Exception as e:
            print(f"❌ Error getting reported concepts: {e}")
            return {}

    def get_financial_statements_multiple_years(self, cik: str, report_type: str, periods: List[str]) -> Dict[str, Any]:
        """Get financial statements for multiple years and provide historical analysis"""
        try:
            historical_data = {}
            available_periods = []
            
            print(f"📊 Extracting financial data for {len(periods)} years: {periods}")
            
            # Extract data for each year
            for period in periods:
                print(f"\n🔍 Processing year {period}...")
                year_data = self.get_financial_statements(cik, report_type, period)
                
                if year_data and any(year_data.get(statement_type) for statement_type in ['income_statement', 'balance_sheet', 'cash_flow']):
                    historical_data[period] = year_data
                    available_periods.append(period)
                    print(f"✅ Successfully extracted data for {period}")
                else:
                    print(f"⚠️ No data found for {period}")
            
            if not historical_data:
                print("❌ No data found for any of the requested years")
                return {}
            
            # Create summary for trend analysis
            trend_summary = {
                'company_cik': cik,
                'report_type': report_type,
                'available_years': available_periods,
                'historical_data': historical_data,
                'trend_analysis': self._prepare_trend_analysis(historical_data)
            }
            
            print(f"📈 Prepared trend analysis for {len(available_periods)} years: {available_periods}")            
            return trend_summary
            
        except Exception as e:
            print(f"❌ Error getting historical financial statements: {e}")
            return {}

    def _prepare_trend_analysis(self, historical_data: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare data structure for trend analysis"""
        trend_data = {
            'income_statement_trends': {},
            'balance_sheet_trends': {},
            'cash_flow_trends': {},
            'key_metrics': {}
        }
        
        # Extract key metrics across years
        for statement_type in ['income_statement', 'balance_sheet', 'cash_flow']:
            for year, year_data in historical_data.items():
                if statement_type in year_data:
                    for concept_name, concept_data in year_data[statement_type].items():
                        if concept_name not in trend_data[f'{statement_type}_trends']:
                            trend_data[f'{statement_type}_trends'][concept_name] = {}
                        
                        trend_data[f'{statement_type}_trends'][concept_name][year] = {
                            'value': concept_data.get('value'),
                            'unit': concept_data.get('unit'),
                            'label': concept_data.get('label')
                        }
        
        return trend_data 
    
    # Peer-group analysis -> Multiple tickers/ciks
    def get_peer_group_analysis(self, ciks: list[str], report_type: str, period: str) -> Dict[str, Any]:
        """Get peer group analysis for multiple companies"""
        try:
            peer_group_data = {}
            
            # Get the company's financial data for each cik
            for cik in ciks:
                print(f"📊 Getting data for CIK: {cik}")
                company_data = self.get_financial_statements(cik, report_type, period)
                
                if company_data:
                    # Store by CIK for easy reference
                    peer_group_data[cik] = company_data
                    print(f"✅ Successfully retrieved data for CIK: {cik}")
                else:
                    print(f"⚠️ No data found for CIK: {cik}")
            
            if not peer_group_data:
                print("❌ No data retrieved for any company in peer group")
                return {}
            
            print(f"📈 Peer group data collected for {len(peer_group_data)} companies")
            return peer_group_data

        except Exception as e:
            print(f"❌ Error getting peer group data: {e}")
            return {}
        

    def GetRatios(self, ciks: List[str], periods: List[str]) -> Dict:
        """
        Calculate financial ratios for multiple companies across multiple periods
        
        Args:
            ciks: List of company CIKs (e.g., ["789019", "320193"])
            periods: List of fiscal years as strings (e.g., ["2023", "2024"])
        
        Returns:
            Dict with calculated ratios for each company and period
        """
        
        def fetch_company_facts(cik: str) -> Dict:
            """Fetch SEC company facts"""
            url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik.zfill(10)}.json"
            headers = {"User-Agent": "Financial Analysis Tool contact@example.com"}
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
        
        def extract_value(us_gaap: Dict, gaap_name: str, year: str) -> float:
            """Extract a specific value for a given year"""
            if gaap_name not in us_gaap:
                return 0.0
            
            if "USD" not in us_gaap[gaap_name].get("units", {}):
                # Try shares for per-share data
                if "shares" in us_gaap[gaap_name].get("units", {}):
                    for entry in us_gaap[gaap_name]["units"]["shares"]:
                        if entry.get("form") in ["10-K", "10-K/A"] and str(entry.get("fy")) == year:
                            return entry.get("val", 0.0)
                return 0.0
            
            for entry in us_gaap[gaap_name]["units"]["USD"]:
                if entry.get("form") in ["10-K", "10-K/A"] and str(entry.get("fy")) == year:
                    return entry.get("val", 0.0)
            
            return 0.0
        
        def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
            """Safely divide two numbers"""
            if denominator == 0:
                return default
            return numerator / denominator
        
        def calculate_ratios_for_period(us_gaap: Dict, year: str) -> Dict:
            """Calculate all ratios for a single period"""
            
            # Extract raw values - trying multiple possible GAAP names for each metric
            revenue = (extract_value(us_gaap, "Revenues", year) or 
                    extract_value(us_gaap, "RevenueFromContractWithCustomerExcludingAssessedTax", year) or
                    extract_value(us_gaap, "SalesRevenueNet", year))
            
            cost_of_goods_sold = (extract_value(us_gaap, "CostOfRevenue", year) or
                                extract_value(us_gaap, "CostOfGoodsAndServicesSold", year))
            
            gross_profit = extract_value(us_gaap, "GrossProfit", year)
            if not gross_profit and revenue and cost_of_goods_sold:
                gross_profit = revenue - cost_of_goods_sold
            
            operating_income = (extract_value(us_gaap, "OperatingIncomeLoss", year) or
                            extract_value(us_gaap, "IncomeLossFromContinuingOperations", year))
            
            net_income = (extract_value(us_gaap, "NetIncomeLoss", year) or
                        extract_value(us_gaap, "ProfitLoss", year))
            
            interest_expense = (extract_value(us_gaap, "InterestExpense", year) or
                            extract_value(us_gaap, "InterestExpenseDebt", year))
            
            depreciation_amortization = (extract_value(us_gaap, "DepreciationDepletionAndAmortization", year) or
                                        extract_value(us_gaap, "Depreciation", year))
            
            total_assets = (extract_value(us_gaap, "Assets", year) or
                        extract_value(us_gaap, "AssetsCurrent", year))
            
            current_assets = extract_value(us_gaap, "AssetsCurrent", year)
            
            current_liabilities = extract_value(us_gaap, "LiabilitiesCurrent", year)
            
            total_liabilities = (extract_value(us_gaap, "Liabilities", year) or
                                extract_value(us_gaap, "LiabilitiesAndStockholdersEquity", year) - 
                                extract_value(us_gaap, "StockholdersEquity", year))
            
            total_equity = (extract_value(us_gaap, "StockholdersEquity", year) or
                        extract_value(us_gaap, "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", year))
            
            cash = (extract_value(us_gaap, "CashAndCashEquivalentsAtCarryingValue", year) or
                extract_value(us_gaap, "Cash", year))
            
            inventory = (extract_value(us_gaap, "InventoryNet", year) or
                        extract_value(us_gaap, "Inventory", year))
            
            accounts_receivable = (extract_value(us_gaap, "AccountsReceivableNetCurrent", year) or
                                extract_value(us_gaap, "AccountsReceivableNet", year))
            
            operating_cash_flow = (extract_value(us_gaap, "NetCashProvidedByUsedInOperatingActivities", year))
            
            capex = (extract_value(us_gaap, "PaymentsToAcquirePropertyPlantAndEquipment", year) or
                    extract_value(us_gaap, "CapitalExpendituresIncurredButNotYetPaid", year))
            
            # Try to get shares outstanding
            shares_outstanding = (extract_value(us_gaap, "CommonStockSharesOutstanding", year) or
                                extract_value(us_gaap, "WeightedAverageNumberOfSharesOutstandingBasic", year) or
                                extract_value(us_gaap, "CommonStockSharesIssued", year))
            
            # Store raw values
            raw_values = {
                "revenue": revenue,
                "gross_profit": gross_profit,
                "operating_income": operating_income,
                "net_income": net_income,
                "cost_of_goods_sold": cost_of_goods_sold,
                "depreciation_amortization": depreciation_amortization,
                "interest_expense": interest_expense,
                "shares_outstanding": shares_outstanding,
                "total_assets": total_assets,
                "current_assets": current_assets,
                "total_liabilities": total_liabilities,
                "current_liabilities": current_liabilities,
                "total_equity": total_equity,
                "cash": cash,
                "inventory": inventory,
                "accounts_receivable": accounts_receivable,
                "operating_cash_flow": operating_cash_flow,
                "capex": capex
            }
            
            # Calculate ratios
            ratios = {}
            
            # Revenue (just the raw value)
            ratios["revenue"] = {
                "value": revenue,
                "label": "Revenue",
                "formatted": f"${revenue:.2f}M"
            }
            
            # Profitability Ratios
            ratios["gross_profit_margin"] = {
                "value": round(safe_divide(gross_profit, revenue) * 100, 2),
                "label": "Gross Profit Margin",
                "formatted": f"{round(safe_divide(gross_profit, revenue) * 100, 2):.2f}%"
            }
            
            ratios["operating_margin"] = {
                "value": round(safe_divide(operating_income, revenue) * 100, 2),
                "label": "Operating Margin",
                "formatted": f"{round(safe_divide(operating_income, revenue) * 100, 2):.2f}%"
            }
            
            ratios["net_margin"] = {
                "value": round(safe_divide(net_income, revenue) * 100, 2),
                "label": "Net Margin",
                "formatted": f"{round(safe_divide(net_income, revenue) * 100, 2):.2f}%"
            }
            
            # EBITDA Margin (using operating income as proxy if depreciation not available)
            ebitda = operating_income + depreciation_amortization
            ratios["ebitda_margin"] = {
                "value": round(safe_divide(ebitda, revenue) * 100, 2),
                "label": "EBITDA Margin",
                "formatted": f"{round(safe_divide(ebitda, revenue) * 100, 2):.2f}%"
            }
            
            # Liquidity Ratios
            ratios["current_ratio"] = {
                "value": round(safe_divide(current_assets, current_liabilities), 2),
                "label": "Current Ratio",
                "formatted": f"{round(safe_divide(current_assets, current_liabilities), 2):.2f}x"
            }
            
            quick_assets = current_assets - inventory
            ratios["quick_ratio"] = {
                "value": round(safe_divide(quick_assets, current_liabilities), 2),
                "label": "Quick Ratio",
                "formatted": f"{round(safe_divide(quick_assets, current_liabilities), 2):.2f}x"
            }
            
            ratios["cash_ratio"] = {
                "value": round(safe_divide(cash, current_liabilities), 2),
                "label": "Cash Ratio",
                "formatted": f"{round(safe_divide(cash, current_liabilities), 2):.2f}x"
            }
            
            # Leverage Ratios
            # Note: Your reference shows 0.0 for debt ratios - might need long-term debt specifically
            long_term_debt = extract_value(us_gaap, "LongTermDebt", year)
            
            ratios["debt_to_equity"] = {
                "value": round(safe_divide(long_term_debt, total_equity), 2),
                "label": "Debt to Equity",
                "formatted": f"{round(safe_divide(long_term_debt, total_equity), 2):.2f}"
            }
            
            total_capitalization = total_equity + long_term_debt
            ratios["debt_to_total_capitalization"] = {
                "value": round(safe_divide(long_term_debt, total_capitalization), 2),
                "label": "Debt to Total Capitalization",
                "formatted": f"{round(safe_divide(long_term_debt, total_capitalization), 2):.2f}"
            }
            
            ratios["total_assets_to_equity"] = {
                "value": round(safe_divide(total_assets, total_equity), 2),
                "label": "Total Assets/Equity",
                "formatted": f"{round(safe_divide(total_assets, total_equity), 2):.2f}"
            }
            
            # Return Ratios
            ratios["roe"] = {
                "value": round(safe_divide(net_income, total_equity) * 100, 2),
                "label": "Return on Equity (ROE)",
                "formatted": f"{round(safe_divide(net_income, total_equity) * 100, 2):.2f}%"
            }
            
            ratios["roa"] = {
                "value": round(safe_divide(net_income, total_assets) * 100, 2),
                "label": "Return on Assets (ROA)",
                "formatted": f"{round(safe_divide(net_income, total_assets) * 100, 2):.2f}%"
            }
            
            # ROIC = Net Income / (Total Equity + Long-term Debt)
            invested_capital = total_equity + long_term_debt
            ratios["roic"] = {
                "value": round(safe_divide(net_income, invested_capital) * 100, 2),
                "label": "Return on Invested Capital (ROIC)",
                "formatted": f"{round(safe_divide(net_income, invested_capital) * 100, 2):.2f}%"
            }
            
            # Coverage Ratios
            if interest_expense > 0:
                ratios["interest_coverage"] = {
                    "value": round(safe_divide(operating_income, interest_expense), 2),
                    "label": "Interest Coverage Ratio",
                    "formatted": f"{round(safe_divide(operating_income, interest_expense), 2):.2f}x"
                }
            
            # Efficiency Ratios
            ratios["inventory_turnover"] = {
                "value": round(safe_divide(cost_of_goods_sold, inventory), 2),
                "label": "Inventory Turnover",
                "formatted": f"{round(safe_divide(cost_of_goods_sold, inventory), 2):.2f}x"
            }
            
            ratios["receivables_ratio"] = {
                "value": round(safe_divide(accounts_receivable, revenue), 2),
                "label": "Receivables Ratio",
                "formatted": f"{round(safe_divide(accounts_receivable, revenue), 2):.2f}x"
            }
            
            # Cash Flow Ratios
            ratios["operating_cash_flow_to_net_income"] = {
                "value": round(safe_divide(operating_cash_flow, net_income), 2),
                "label": "Operating Cash Flow/Net Income",
                "formatted": f"{round(safe_divide(operating_cash_flow, net_income), 2):.2f}"
            }
            
            # Book Value (total equity in thousands)
            ratios["book_value"] = {
                "value": round(total_equity / 1000000, 0),
                "label": "Book Value",
                "formatted": f"${round(total_equity / 1000000, 2):.2f}"
            }
            
            ratios["tangible_book_value"] = {
                "value": round(total_equity / 1000000, 0),
                "label": "Tangible Book Value",
                "formatted": f"${round(total_equity / 1000000, 2):.2f}"
            }
            
            # Working Capital
            net_working_capital = current_assets - current_liabilities
            ratios["net_working_capital_ratio"] = {
                "value": round(safe_divide(net_working_capital, total_assets), 2),
                "label": "Net Working Capital Ratio",
                "formatted": f"{round(safe_divide(net_working_capital, total_assets), 2):.2f}x"
            }
            
            # Per Share Data
            ratios["earnings_per_share"] = {
                "value": round(safe_divide(net_income, shares_outstanding), 2),
                "label": "Earnings Per Share",
                "formatted": f"${round(safe_divide(net_income, shares_outstanding), 2):.2f}"
            }
            
            # Calculate metadata
            non_zero_values = sum(1 for v in raw_values.values() if v != 0.0)
            total_values = len(raw_values)
            completeness = round((non_zero_values / total_values) * 100, 1)
            
            quality_score = "Excellent" if completeness >= 90 else "Good" if completeness >= 70 else "Fair" if completeness >= 50 else "Poor"
            
            return {
                "ratios": ratios,
                "raw_values": raw_values,
                "calculation_metadata": {
                    "total_ratios_calculated": len(ratios),
                    "data_quality": {
                        "completeness": completeness,
                        "non_zero_values": non_zero_values,
                        "total_values": total_values,
                        "quality_score": quality_score
                    }
                }
            }
        
        # Main execution
        result = {
            "calculated_ratios": {
                "peer_group_ratios": {},
                "summary": {
                    "total_companies": len(ciks),
                    "companies_with_data": 0
                }
            }
        }
        
        for cik in ciks:
            try:
                company_facts = fetch_company_facts(cik)
                company_name = company_facts.get("entityName", "Unknown")
                us_gaap = company_facts["facts"]["us-gaap"]
                
                # Get ticker symbol (approximate from company name or use CIK)
                ticker = cik  # Default to CIK if we can't determine ticker
                
                company_data = {
                    "company_name": company_name,
                    "periods": {}
                }
                
                for period in periods:
                    period_data = calculate_ratios_for_period(us_gaap, period)
                    company_data["periods"][period] = period_data
                
                result["calculated_ratios"]["peer_group_ratios"][ticker] = company_data
                result["calculated_ratios"]["summary"]["companies_with_data"] += 1
                
            except Exception as e:
                print(f"Error processing CIK {cik}: {str(e)}")
                continue
        
        return result




        

