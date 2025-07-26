import requests
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
import time
from app.config import settings
from app.schemas.sec_data import SECCompanyFacts, SECSubmissions, SECValue
from app.services.xbrl_parser import XBRLParser


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