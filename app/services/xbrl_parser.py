import requests
import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional
from datetime import datetime
import time
from app.config import settings


class XBRLParser:
    """Parse XBRL files from SEC EDGAR for accurate financial data extraction"""
    
    def __init__(self):
        self.base_url = "https://www.sec.gov/Archives/edgar/data"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'MySECApp/1.0 (test@example.com)',
            'Accept': 'application/xml, text/xml, */*',
            'Accept-Encoding': 'gzip, deflate'
        })
    
    def get_xbrl_files(self, cik: str, accession_number: str) -> Dict[str, str]:
        """Get XBRL files for a specific filing"""
        try:
            # Pad CIK with zeros
            cik_padded = cik.zfill(10)
            
            # Construct the filing directory URL
            filing_url = f"{self.base_url}/{cik}/{accession_number.replace('-', '')}"
            
            # Get the filing index
            index_url = f"{filing_url}/{accession_number}-index.html"
            response = self.session.get(index_url)
            response.raise_for_status()
            
            # Parse the index to find XBRL files
            xbrl_files = {}
            content = response.text
            
            # Look for XBRL instance document
            if f"{accession_number}.xml" in content:
                xbrl_files['instance'] = f"{filing_url}/{accession_number}.xml"
            
            # Look for XBRL schema
            if f"{accession_number}.xsd" in content:
                xbrl_files['schema'] = f"{filing_url}/{accession_number}.xsd"
            
            # Look for calculation linkbase
            if f"{accession_number}_cal.xml" in content:
                xbrl_files['calculation'] = f"{filing_url}/{accession_number}_cal.xml"
            
            # Look for definition linkbase
            if f"{accession_number}_def.xml" in content:
                xbrl_files['definition'] = f"{filing_url}/{accession_number}_def.xml"
            
            # Look for label linkbase
            if f"{accession_number}_lab.xml" in content:
                xbrl_files['label'] = f"{filing_url}/{accession_number}_lab.xml"
            
            return xbrl_files
            
        except Exception as e:
            print(f"Error getting XBRL files: {e}")
            return {}
    
    def parse_xbrl_instance(self, instance_url: str) -> Dict[str, Any]:
        """Parse XBRL instance document to extract financial facts"""
        try:
            response = self.session.get(instance_url)
            response.raise_for_status()
            
            # Parse XML
            root = ET.fromstring(response.content)
            
            # Define namespaces
            namespaces = {
                'xbrl': 'http://www.xbrl.org/2003/instance',
                'xlink': 'http://www.w3.org/1999/xlink',
                'link': 'http://www.xbrl.org/2003/linkbase',
                'xsi': 'http://www.w3.org/2001/XMLSchema-instance'
            }
            
            # Extract context information
            contexts = {}
            for context in root.findall('.//xbrl:context', namespaces):
                context_id = context.get('id')
                period = context.find('.//xbrl:period', namespaces)
                if period is not None:
                    start_date = period.find('xbrl:startDate', namespaces)
                    end_date = period.find('xbrl:endDate', namespaces)
                    instant = period.find('xbrl:instant', namespaces)
                    
                    contexts[context_id] = {
                        'start_date': start_date.text if start_date is not None else None,
                        'end_date': end_date.text if end_date is not None else None,
                        'instant': instant.text if instant is not None else None
                    }
            
            # Extract facts (financial data)
            facts = {}
            for fact in root.findall('.//xbrl:*'):
                if fact.tag.startswith('{http://www.xbrl.org/2003/instance}'):
                    # Extract concept name (remove namespace)
                    concept = fact.tag.split('}')[-1]
                    
                    # Get context reference
                    context_ref = fact.get('contextRef')
                    context_info = contexts.get(context_ref, {})
                    
                    # Get value and attributes
                    value = fact.text
                    unit_ref = fact.get('unitRef')
                    decimals = fact.get('decimals')
                    
                    if value is not None and value.strip():
                        facts[concept] = {
                            'value': float(value) if value.replace('.', '').replace('-', '').isdigit() else value,
                            'context': context_info,
                            'unit_ref': unit_ref,
                            'decimals': decimals,
                            'raw_value': value
                        }
            
            return {
                'contexts': contexts,
                'facts': facts,
                'namespaces': namespaces
            }
            
        except Exception as e:
            print(f"Error parsing XBRL instance: {e}")
            return {}
    
    def parse_xbrl_schema(self, schema_url: str) -> Dict[str, Any]:
        """Parse XBRL schema to get element definitions"""
        try:
            response = self.session.get(schema_url)
            response.raise_for_status()
            
            root = ET.fromstring(response.content)
            
            # Define namespaces
            namespaces = {
                'xsd': 'http://www.w3.org/2001/XMLSchema',
                'link': 'http://www.xbrl.org/2003/linkbase'
            }
            
            # Extract element definitions
            elements = {}
            for element in root.findall('.//xsd:element', namespaces):
                name = element.get('name')
                type_attr = element.get('type')
                substitution_group = element.get('substitutionGroup')
                
                if name:
                    elements[name] = {
                        'type': type_attr,
                        'substitution_group': substitution_group
                    }
            
            return elements
            
        except Exception as e:
            print(f"Error parsing XBRL schema: {e}")
            return {}
    
    def parse_xbrl_labels(self, label_url: str) -> Dict[str, str]:
        """Parse XBRL label linkbase to get human-readable labels"""
        try:
            response = self.session.get(label_url)
            response.raise_for_status()
            
            root = ET.fromstring(response.content)
            
            # Define namespaces
            namespaces = {
                'link': 'http://www.xbrl.org/2003/linkbase',
                'xlink': 'http://www.w3.org/1999/xlink'
            }
            
            # Extract labels
            labels = {}
            for label in root.findall('.//link:label', namespaces):
                label_id = label.get('id')
                label_text = label.text
                
                if label_id and label_text:
                    labels[label_id] = label_text.strip()
            
            return labels
            
        except Exception as e:
            print(f"Error parsing XBRL labels: {e}")
            return {}
    
    def categorize_financial_data(self, facts: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Categorize XBRL facts into financial statements using standard XBRL concepts"""
        
        # Define financial statement categories with XBRL concept patterns
        categories = {
            'income_statement': [
                'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
                'SalesRevenueNet', 'CostOfGoodsAndServicesSold', 'CostOfRevenue',
                'GrossProfit', 'OperatingExpenses', 'SellingAndMarketingExpense',
                'GeneralAndAdministrativeExpense', 'ResearchAndDevelopmentExpense',
                'OperatingIncomeLoss', 'InterestExpense', 'InterestIncome',
                'IncomeTaxExpenseBenefit', 'NetIncomeLoss', 'EarningsPerShareBasic',
                'EarningsPerShareDiluted', 'WeightedAverageNumberOfSharesOutstandingBasic',
                'WeightedAverageNumberOfSharesOutstandingDiluted', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxes',
                'IncomeLossFromContinuingOperationsAfterIncomeTaxes'
            ],
            'balance_sheet': [
                'Assets', 'CurrentAssets', 'CashAndCashEquivalentsAtCarryingValue',
                'CashAndCashEquivalents', 'AccountsReceivableNetCurrent', 'InventoryNet',
                'InventoryGross', 'PrepaidExpenseAndOtherAssetsCurrent', 'PropertyPlantAndEquipmentNet',
                'PropertyPlantAndEquipmentGross', 'IntangibleAssetsNetExcludingGoodwill',
                'IntangibleAssetsGrossExcludingGoodwill', 'Goodwill', 'Liabilities',
                'CurrentLiabilities', 'AccountsPayableCurrent', 'AccruedLiabilitiesCurrent',
                'LongTermDebtNoncurrent', 'DeferredTaxLiabilitiesNoncurrent', 'StockholdersEquity',
                'CommonStockValue', 'RetainedEarningsAccumulatedDeficit', 'TreasuryStockValue',
                'AdditionalPaidInCapital', 'TotalStockholdersEquity'
            ],
            'cash_flow': [
                'NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInInvestingActivities',
                'NetCashProvidedByUsedInFinancingActivities', 'CashAndCashEquivalentsPeriodIncreaseDecrease',
                'CashAndCashEquivalentsAtCarryingValue', 'PaymentsToAcquirePropertyPlantAndEquipment',
                'ProceedsFromSaleOfPropertyPlantAndEquipment', 'PaymentsForBusinessAcquisitionsNetOfCashAcquired',
                'ProceedsFromIssuanceOfCommonStock', 'PaymentsForRepurchaseOfCommonStock',
                'PaymentsOfDividends', 'CashAndCashEquivalentsAtBeginningOfPeriod',
                'CashAndCashEquivalentsAtEndOfPeriod'
            ]
        }
        
        categorized_data = {
            'income_statement': {},
            'balance_sheet': {},
            'cash_flow': {},
            'other': {}
        }
        
        for concept, data in facts.items():
            categorized = False
            
            # Special handling for cash flow items with increase/decrease keywords
            concept_lower = concept.lower()
            if any(keyword in concept_lower for keyword in ['increase', 'decrease']):
                categorized_data['cash_flow'][concept] = data
                print(f"📋 XBRL: Categorized '{concept}' as cash_flow (increase/decrease keyword)")
                continue
            
            # Use pattern matching for other items
            for statement_type, patterns in categories.items():
                for pattern in patterns:
                    if pattern.lower() in concept_lower:
                        categorized_data[statement_type][concept] = data
                        categorized = True
                        break
                if categorized:
                    break
            
            if not categorized:
                categorized_data['other'][concept] = data
        
        return categorized_data
    
    def get_financial_statements_xbrl(self, cik: str, accession_number: str) -> Dict[str, Any]:
        """Get financial statements using XBRL parsing - most accurate method"""
        try:
            print(f"🔍 Getting XBRL files for CIK {cik}, accession {accession_number}")
            
            # Get XBRL file URLs
            xbrl_files = self.get_xbrl_files(cik, accession_number)
            
            if not xbrl_files:
                print("❌ No XBRL files found")
                return {}
            
            print(f"✅ Found XBRL files: {list(xbrl_files.keys())}")
            
            # Parse instance document (contains actual financial data)
            instance_data = {}
            if 'instance' in xbrl_files:
                instance_data = self.parse_xbrl_instance(xbrl_files['instance'])
            
            # Parse schema for element definitions
            schema_data = {}
            if 'schema' in xbrl_files:
                schema_data = self.parse_xbrl_schema(xbrl_files['schema'])
            
            # Parse labels for human-readable names
            labels = {}
            if 'label' in xbrl_files:
                labels = self.parse_xbrl_labels(xbrl_files['label'])
            
            # Categorize financial data
            if instance_data and 'facts' in instance_data:
                categorized_data = self.categorize_financial_data(instance_data['facts'])
                
                # Add metadata
                result = {
                    'financial_statements': categorized_data,
                    'contexts': instance_data.get('contexts', {}),
                    'schema': schema_data,
                    'labels': labels,
                    'xbrl_files': xbrl_files,
                    'parsing_method': 'XBRL',
                    'total_facts': len(instance_data.get('facts', {}))
                }
                
                print(f"✅ Successfully parsed XBRL data")
                print(f"📊 Income statement items: {len(categorized_data['income_statement'])}")
                print(f"📊 Balance sheet items: {len(categorized_data['balance_sheet'])}")
                print(f"📊 Cash flow items: {len(categorized_data['cash_flow'])}")
                print(f"📊 Other items: {len(categorized_data['other'])}")
                print(f"📊 Total facts found: {result['total_facts']}")
                
                return result
            
            print("❌ No facts found in XBRL instance")
            return {}
            
        except Exception as e:
            print(f"❌ Error parsing XBRL: {e}")
            return {} 