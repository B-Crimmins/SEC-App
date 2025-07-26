import openai
from typing import Dict, Any, List
import time
from app.config import settings


class OpenAIService:
    def __init__(self):
        if settings.OPENAI_API_KEY:
            openai.api_key = settings.OPENAI_API_KEY
        else:
            raise ValueError("OpenAI API key not configured")
    
    def analyze_financial_data(self, financial_data: Dict[str, Any], ticker: str, report_type: str, period: str) -> Dict[str, Any]:
        """Generate financial analysis using GPT-4"""
        try:
            # Prepare the financial data for analysis
            analysis_prompt = self._create_analysis_prompt(financial_data, ticker, report_type, period)
            
            start_time = time.time()
            
            response = openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """You are a financial analyst expert. Analyze the provided financial data and provide:
                        1. A comprehensive summary of the company's financial performance
                        2. Key takeaways and insights
                        
                        3. Risk assessment and business impact
                        4. Growth analysis and business impact
                        5. Liquidity analysis and business impact
                        
                        Provide evidence-based analysis with specific numbers and trends."""
                    },
                    {
                        "role": "user",
                        "content": analysis_prompt
                    }
                ],
                max_tokens=4000,
                temperature=0.3
            )
            
            processing_time = int(time.time() - start_time)
            
            # Parse the response
            analysis_text = response.choices[0].message.content or ""
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            # Extract different sections from the analysis
            analysis_sections = self._parse_analysis_response(analysis_text)
            
            return {
                'summary': analysis_sections.get('summary', ''),
                'key_takeaways': analysis_sections.get('key_takeaways', []),
                # 'financial_health_score': analysis_sections.get('financial_health_score', 50),
                'risk_assessment': analysis_sections.get('risk_assessment', ''),
                'growth_analysis': analysis_sections.get('growth_analysis', ''),
                'liquidity_analysis': analysis_sections.get('liquidity_analysis', ''),
                'openai_model_used': 'gpt-4o',
                'tokens_used': tokens_used,
                'processing_time': processing_time
            }
            
        except Exception as e:
            print(f"Error in OpenAI analysis: {e}")
            return {
                'summary': f"Error analyzing financial data: {str(e)}",
                'key_takeaways': [],
                'risk_assessment': '',
                'growth_analysis': '',
                'liquidity_analysis': '',
                'openai_model_used': 'gpt-4o',
                'tokens_used': 0,
                'processing_time': 0
            }
    
    def _create_analysis_prompt(self, financial_data: Dict[str, Any], ticker: str, report_type: str, period: str) -> str:
        """Create a detailed prompt for financial analysis"""
        
        # Format financial data for the prompt
        income_statement = financial_data.get('income_statement', {})
        balance_sheet = financial_data.get('balance_sheet', {})
        cash_flow = financial_data.get('cash_flow', {})
        
        prompt = f"""
        Analyze the financial data for {ticker} ({report_type} for {period}):
        
        INCOME STATEMENT:
        {self._format_financial_data(income_statement)}
        
        BALANCE SHEET:
        {self._format_financial_data(balance_sheet)}
        
        CASH FLOW STATEMENT:
        {self._format_financial_data(cash_flow)}
        
        Please provide a comprehensive analysis including:
        1. Executive Summary (2-3 paragraphs)
        2. Key Takeaways (bullet points with specific numbers)
        3. Risk Assessment (specific risks identified)
        4. Growth Analysis (revenue, profit trends)
        5. Liquidity Analysis (cash position, working capital)
        
        Format your response with clear section headers.
        """
        
        return prompt
    
    def _format_financial_data(self, data: Dict[str, Any]) -> str:
        """Format financial data for the prompt"""
        if not data:
            return "No data available"
        
        formatted = []
        for concept, value_data in data.items():
            if isinstance(value_data, dict) and 'value' in value_data:
                value = value_data['value']
                unit = value_data.get('unit', '')
                formatted.append(f"{concept}: {value} {unit}")
        
        return "\n".join(formatted) if formatted else "No data available"
    
    def _parse_analysis_response(self, response_text: str) -> Dict[str, Any]:
        """Parse the AI response into structured sections"""
        sections = {
            'summary': '',
            'key_takeaways': [],
        
            'risk_assessment': '',
            'growth_analysis': '',
            'liquidity_analysis': ''
        }
        
        # Simple parsing - in production, you might want more sophisticated parsing
        lines = response_text.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Detect sections
            if 'summary' in line.lower() or 'executive summary' in line.lower():
                current_section = 'summary'
                continue
            elif 'takeaways' in line.lower() or 'key' in line.lower():
                current_section = 'key_takeaways'
                continue

            elif 'risk' in line.lower():
                current_section = 'risk_assessment'
                continue
            elif 'growth' in line.lower():
                current_section = 'growth_analysis'
                continue
            elif 'liquidity' in line.lower():
                current_section = 'liquidity_analysis'
                continue
            
            # Add content to current section
            if current_section == 'summary':
                sections['summary'] += line + ' '
            elif current_section == 'key_takeaways':
                if line.startswith('-') or line.startswith('•'):
                    sections['key_takeaways'].append(line.lstrip('- ').lstrip('• '))

            elif current_section == 'risk_assessment':
                sections['risk_assessment'] += line + ' '
            elif current_section == 'growth_analysis':
                sections['growth_analysis'] += line + ' '
            elif current_section == 'liquidity_analysis':
                sections['liquidity_analysis'] += line + ' '
        
        return sections

    def analyze_historical_trends(self, historical_data: Dict[str, Any], ticker: str, report_type: str) -> Dict[str, Any]:
        """Generate historical trend analysis using GPT-4"""
        try:
            # Prepare the historical data for analysis
            analysis_prompt = self._create_trend_analysis_prompt(historical_data, ticker, report_type)
            
            start_time = time.time()
            
            response = openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """You are a financial analyst expert specializing in historical trend analysis. Analyze the provided multi-year financial data and provide:
                        1. Executive Summary of trends across the time period
                        2. Revenue and Profitability Trends (with specific growth rates)
                        3. Balance Sheet Trends (assets, liabilities, equity changes)
                        4. Cash Flow Trends (operating, investing, financing activities)
                        5. Key Performance Indicators (KPIs) over time
                        6. Risk Assessment based on historical patterns
                        7. Future Outlook based on trends
                        
                        Provide evidence-based analysis with specific numbers, percentages, and trends."""
                    },
                    {
                        "role": "user",
                        "content": analysis_prompt
                    }
                ],
                max_tokens=3000,
                temperature=0.3
            )
            
            processing_time = int(time.time() - start_time)
            
            # Parse the response
            analysis_text = response.choices[0].message.content or ""
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            # Extract different sections from the analysis
            analysis_sections = self._parse_trend_analysis_response(analysis_text)
            
            return {
                'executive_summary': analysis_sections.get('executive_summary', ''),
                'revenue_trends': analysis_sections.get('revenue_trends', ''),
                'profitability_trends': analysis_sections.get('profitability_trends', ''),
                'balance_sheet_trends': analysis_sections.get('balance_sheet_trends', ''),
                'cash_flow_trends': analysis_sections.get('cash_flow_trends', ''),
                'kpi_analysis': analysis_sections.get('kpi_analysis', ''),
                'risk_assessment': analysis_sections.get('risk_assessment', ''),
                'future_outlook': analysis_sections.get('future_outlook', ''),
                'openai_model_used': 'gpt-4o',
                'tokens_used': tokens_used,
                'processing_time': processing_time
            }
            
        except Exception as e:
            print(f"Error in OpenAI trend analysis: {e}")
            return {
                'executive_summary': f"Error analyzing historical trends: {str(e)}",
                'revenue_trends': '',
                'profitability_trends': '',
                'balance_sheet_trends': '',
                'cash_flow_trends': '',
                'kpi_analysis': '',
                'risk_assessment': '',
                'future_outlook': '',
                'openai_model_used': 'gpt-4o',
                'tokens_used': 0,
                'processing_time': 0
            }

    def _create_trend_analysis_prompt(self, historical_data: Dict[str, Any], ticker: str, report_type: str) -> str:
        """Create a detailed prompt for historical trend analysis"""
        
        available_years = historical_data.get('available_years', [])
        historical_financial_data = historical_data.get('historical_data', {})
        trend_data = historical_data.get('trend_analysis', {})
        
        prompt = f"""
        Analyze the historical financial trends for {ticker} ({report_type}) across {len(available_years)} years: {available_years}
        
        HISTORICAL FINANCIAL DATA BY YEAR:
        """
        
        # Add year-by-year data
        for year in available_years:
            if year in historical_financial_data:
                year_data = historical_financial_data[year]
                prompt += f"\n{year}:\n"
                prompt += f"  Income Statement: {self._format_financial_data(year_data.get('income_statement', {}))}\n"
                prompt += f"  Balance Sheet: {self._format_financial_data(year_data.get('balance_sheet', {}))}\n"
                prompt += f"  Cash Flow: {self._format_financial_data(year_data.get('cash_flow', {}))}\n"
        
        # Add trend data
        prompt += f"\nTREND ANALYSIS DATA:\n"
        for statement_type in ['income_statement_trends', 'balance_sheet_trends', 'cash_flow_trends']:
            if statement_type in trend_data:
                prompt += f"\n{statement_type.replace('_', ' ').title()}:\n"
                for concept, year_data in trend_data[statement_type].items():
                    prompt += f"  {concept}:\n"
                    for year, data in year_data.items():
                        value = data.get('value', 'N/A')
                        unit = data.get('unit', '')
                        prompt += f"    {year}: {value} {unit}\n"
        
        prompt += """
        Please provide a comprehensive historical trend analysis including:
        1. Revenue and Profitability Trends (with growth rates and percentages)
        2. Balance Sheet Trends (asset, liability, equity changes)
        3. Cash Flow Trends (operating, investing, financing patterns)
        4. Key Performance Indicators (ROE, ROA, debt ratios, etc.)
       
        
        Include specific numbers, percentages, and year-over-year comparisons. For each metric, do the following:
         -Internally calculate the percentage changes and double check your math and subsequent logical conclusions prior to sharing with the user.
         -Determine if the metric increased, decreased, or remained stable.
         -Explain the business implication of that change in one sentence.
Then summarize all insights in a bulleted list.
        """
        
        return prompt

    def generate_line_item_trend_analysis(self, historical_data: Dict[str, Any], ticker: str, report_type: str) -> Dict[str, Any]:
        """Generate trend analysis for individual line items"""
        try:
            start_time = time.time()
            
            analysis_prompt = self._create_line_item_trend_prompt(historical_data, ticker, report_type)
            
            response = openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """You are a financial analyst specializing in trend analysis. 
                        For each line item, provide a brief (1-2 sentences) business implication of the trend observed.
                        Focus on what the trend means for the business, not just the numbers.
                        Be concise and actionable."""
                    },
                    {
                        "role": "user",
                        "content": analysis_prompt
                    }
                ],
                max_tokens=2000,
                temperature=0.3
            )
            
            processing_time = int(time.time() - start_time)
            analysis_text = response.choices[0].message.content or ""
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            # Parse the line item analysis
            line_item_analysis = self._parse_line_item_trend_response(analysis_text)
            
            return {
                'line_item_trends': line_item_analysis,
                'openai_model_used': 'gpt-4o',
                'tokens_used': tokens_used,
                'processing_time': processing_time
            }
            
        except Exception as e:
            print(f"Error in line item trend analysis: {e}")
            return {
                'line_item_trends': {},
                'openai_model_used': 'gpt-4o',
                'tokens_used': 0,
                'processing_time': 0
            }

    def _create_line_item_trend_prompt(self, historical_data: Dict[str, Any], ticker: str, report_type: str) -> str:
        """Create a prompt for line-item-specific trend analysis"""
        
        available_years = historical_data.get('available_years', [])
        historical_financial_data = historical_data.get('historical_data', {})
        
        prompt = f"""
        Analyze the trends for key financial line items for {ticker} ({report_type}) across {len(available_years)} years: {available_years}
        
        For each line item below, provide a brief business implication (1-2 sentences) of the trend observed:
        """
        
        # Extract all major line items and their values across years
        all_line_items = {}
        
        for year in available_years:
            if year in historical_financial_data:
                year_data = historical_financial_data[year]
                
                # Extract values for all major items from all statements
                income_stmt = year_data.get('income_statement', {})
                balance_sheet = year_data.get('balance_sheet', {})
                cash_flow = year_data.get('cash_flow', {})
                
                # Process income statement items
                for concept, data in income_stmt.items():
                    if isinstance(data, dict) and 'value' in data and data['value'] is not None:
                        label = data.get('label', concept)
                        if label not in all_line_items:
                            all_line_items[label] = []
                        all_line_items[label].append((year, data['value']))
                
                # Process balance sheet items
                for concept, data in balance_sheet.items():
                    if isinstance(data, dict) and 'value' in data and data['value'] is not None:
                        label = data.get('label', concept)
                        if label not in all_line_items:
                            all_line_items[label] = []
                        all_line_items[label].append((year, data['value']))
                
                # Process cash flow items
                for concept, data in cash_flow.items():
                    if isinstance(data, dict) and 'value' in data and data['value'] is not None:
                        label = data.get('label', concept)
                        if label not in all_line_items:
                            all_line_items[label] = []
                        all_line_items[label].append((year, data['value']))
        
        # Add the data to the prompt
        for item_name, year_values in all_line_items.items():
            if len(year_values) >= 2:  # Only include items with data for at least 2 years
                prompt += f"\n{item_name}:\n"
                for year, value in year_values:
                    if isinstance(value, (int, float)):
                        prompt += f"  {year}: {value:,.0f}\n"
                    else:
                        prompt += f"  {year}: {value}\n"
        
        prompt += """
        For each line item above, provide a brief business implication of the trend observed.
        Format your response as:
        Revenue: [business implication]
        Net Income: [business implication]
        etc.
        """
        
        return prompt

    def _find_concept_value(self, data: Dict[str, Any], concepts: List[str]) -> float:
        """Find the value for a concept in financial data"""
        for concept in concepts:
            if concept in data:
                value_data = data[concept]
                if isinstance(value_data, dict) and 'value' in value_data:
                    value = value_data['value']
                    if value is not None:
                        return float(value)
        return 0.0

    def _parse_line_item_trend_response(self, response_text: str) -> Dict[str, str]:
        """Parse the line item trend analysis response"""
        line_item_analysis = {}
        
        lines = response_text.split('\n')
        current_item = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check if this is a line item header
            if ':' in line and not line.startswith(' '):
                parts = line.split(':', 1)
                if len(parts) == 2:
                    current_item = parts[0].strip()
                    line_item_analysis[current_item] = parts[1].strip()
            elif current_item and line:
                # Continue the analysis for the current item
                line_item_analysis[current_item] += ' ' + line
        
        return line_item_analysis

    def _parse_trend_analysis_response(self, response_text: str) -> Dict[str, Any]:
        """Parse the trend analysis response into structured sections"""
        sections = {
            'executive_summary': '',
            'revenue_trends': '',
            'profitability_trends': '',
            'balance_sheet_trends': '',
            'cash_flow_trends': '',
            'kpi_analysis': '',
            'risk_assessment': '',
            'future_outlook': ''
        }
        
        # Simple parsing - in production, you might want more sophisticated parsing
        lines = response_text.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Detect sections
            if 'executive summary' in line.lower():
                current_section = 'executive_summary'
                continue
            elif 'revenue' in line.lower() and 'trend' in line.lower():
                current_section = 'revenue_trends'
                continue
            elif 'profitability' in line.lower():
                current_section = 'profitability_trends'
                continue
            elif 'balance sheet' in line.lower():
                current_section = 'balance_sheet_trends'
                continue
            elif 'cash flow' in line.lower():
                current_section = 'cash_flow_trends'
                continue
            elif 'kpi' in line.lower() or 'performance' in line.lower():
                current_section = 'kpi_analysis'
                continue
            elif 'risk' in line.lower():
                current_section = 'risk_assessment'
                continue
            elif 'future' in line.lower() or 'outlook' in line.lower():
                current_section = 'future_outlook'
                continue
            
            # Add content to current section
            if current_section and current_section in sections:
                sections[current_section] += line + ' '
        
        return sections 

    # Peer Group Prompt creation
    def create_peer_group_analysis_prompt(self, peer_group_data: Dict[str, Any]) -> str:
        """Create a prompt for analyzing multiple companies in a peer group"""
        
        prompt = f"""
        Analyze the financial data for the peer group of companies:
        
        """
        
        # Add data for each company in the peer group
        for cik, company_data in peer_group_data.items():
            prompt += f"\nCOMPANY CIK {cik}:\n"
            prompt += f"  INCOME STATEMENT:\n"
            prompt += f"  {self._format_financial_data(company_data.get('income_statement', {}))}\n"
            prompt += f"  BALANCE SHEET:\n"
            prompt += f"  {self._format_financial_data(company_data.get('balance_sheet', {}))}\n"
            prompt += f"  CASH FLOW STATEMENT:\n"
            prompt += f"  {self._format_financial_data(company_data.get('cash_flow', {}))}\n"
            prompt += f"  {'-'*50}\n"

        prompt += f"""
        Please provide a comprehensive comparative analysis of this peer group. All analysis should be on a relative basis comparing the companies in the group:
        1. Executive Summary (2-3 paragraphs comparing the companies)
        2. Key Takeaways (bullet points with specific numbers and comparisons)

        4. Risk Assessment (specific risks identified for each company)
        5. Growth Analysis (revenue, profit trends comparison)
        6. Liquidity Analysis (cash position, working capital comparison)
        
        Focus on comparing and contrasting the companies in the peer group.
        Format your response with clear section headers.
        """

        return prompt

    # AI to analyze peer group 
    def analyze_peer_group(self, peer_group_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze a peer group of companies"""
        try:
            # Prepare the peer group data for analysis
            analysis_prompt = self.create_peer_group_analysis_prompt(peer_group_data)
            
            start_time = time.time()
            
            response = openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """You are a financial analyst expert specializing in peer group analysis. Analyze the provided financial data for multiple companies and provide:
                        1. A comprehensive comparative summary of the companies' financial performance
                        2. Key takeaways and insights comparing the companies

                        4. Risk assessment for each company
                        5. Growth analysis comparing revenue and profit trends
                        6. Liquidity analysis comparing cash positions and working capital
                        
                        Focus on comparative analysis and relative performance. Provide evidence-based analysis with specific numbers and trends."""
                    },
                    {
                        "role": "user",
                        "content": analysis_prompt
                    }
                ],
                max_tokens=2000,
                temperature=0.3
            )

            processing_time = int(time.time() - start_time)
            
            # Parse the response
            analysis_text = response.choices[0].message.content or ""
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            # Extract different sections from the analysis
            analysis_sections = self._parse_analysis_response(analysis_text)
            
            return {
                'summary': analysis_sections.get('summary', ''),
                'key_takeaways': analysis_sections.get('key_takeaways', []),

                'risk_assessment': analysis_sections.get('risk_assessment', ''),
                'growth_analysis': analysis_sections.get('growth_analysis', ''),
                'liquidity_analysis': analysis_sections.get('liquidity_analysis', ''),
                'openai_model_used': 'gpt-4',
                'tokens_used': tokens_used,
                'processing_time': processing_time
            }
            
        except Exception as e:
            print(f"Error in OpenAI analysis: {e}")
            return {
                'summary': f"Error analyzing financial data: {str(e)}",
                'key_takeaways': [],

                'risk_assessment': '',
                'growth_analysis': '',
                'liquidity_analysis': '',
                'openai_model_used': 'gpt-4',
                'tokens_used': 0,
                'processing_time': 0
            }

    def generate_statement_flow_explanations(self, financial_data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """Generate explanations of how line items flow between financial statements"""
        try:
            print(f"🔍 Starting flow explanation generation for {ticker}")
            
            # Create flow explanation prompt
            flow_prompt = self._create_flow_explanation_prompt(financial_data, ticker)
            print(f"🔍 Created flow prompt, length: {len(flow_prompt)}")
            
            start_time = time.time()
            
            response = openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": """You are a financial educator expert. Explain how specific line items flow between financial statements (Income Statement, Balance Sheet, Cash Flow Statement). Provide clear, educational explanations that help users understand the relationships between statements. Focus on key items like:
                        - Net Income → Retained Earnings → Cash Flow from Operations
                        - Depreciation → Cash Flow from Operations
                        - Changes in Working Capital → Cash Flow from Operations
                        - Capital Expenditures → Cash Flow from Investing
                        - Debt Issuance/Repayment → Cash Flow from Financing
                        - Uses of cash
                        
                        Format as a dictionary with line item names as keys and explanations as values."""
                    },
                    {
                        "role": "user",
                        "content": flow_prompt
                    }
                ],
                max_tokens=4000,
                temperature=0.3
            )
            
            processing_time = int(time.time() - start_time)
            print(f"🔍 OpenAI API call completed in {processing_time}s")
            
            # Parse the response
            flow_text = response.choices[0].message.content or ""
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            print(f"🔍 Raw AI flow response:")
            print(f"  Length: {len(flow_text)} characters")
            print(f"  First 500 chars: {flow_text[:500]}")
            
            # Parse flow explanations
            flow_explanations = self._parse_flow_explanations(flow_text)
            
            print(f"🔍 Final result: {len(flow_explanations)} flow explanations generated")
            
            return {
                'flow_explanations': flow_explanations,
                'openai_model_used': 'gpt-4o',
                'tokens_used': tokens_used,
                'processing_time': processing_time
            }
            
        except Exception as e:
            print(f"❌ Error generating flow explanations: {e}")
            import traceback
            traceback.print_exc()
            return {
                'flow_explanations': {},
                'openai_model_used': 'gpt-4o',
                'tokens_used': 0,
                'processing_time': 0
            }

    def _create_flow_explanation_prompt(self, financial_data: Dict[str, Any], ticker: str) -> str:
        """Create prompt for statement flow explanations"""
        income_statement = financial_data.get('income_statement', {})
        balance_sheet = financial_data.get('balance_sheet', {})
        cash_flow = financial_data.get('cash_flow', {})
        
        # Get all actual line item labels from the data
        all_labels = []
        for concept, data in income_statement.items():
            if isinstance(data, dict) and 'label' in data:
                all_labels.append(data['label'])
        for concept, data in balance_sheet.items():
            if isinstance(data, dict) and 'label' in data:
                all_labels.append(data['label'])
        for concept, data in cash_flow.items():
            if isinstance(data, dict) and 'label' in data:
                all_labels.append(data['label'])
        
        # Get unique labels and prioritize the most important ones
        unique_labels = list(set(all_labels))
        
        # Define priority categories for better coverage
        priority_keywords = [
            # Income Statement - High Priority
            'revenue', 'sales', 'income', 'profit', 'earnings', 'net income', 'operating income', 'gross profit',
            'cost of', 'expense', 'depreciation', 'amortization', 'tax', 'interest',
            
            # Balance Sheet - High Priority  
            'cash', 'assets', 'liabilities', 'equity', 'debt', 'receivables', 'payables', 'inventory',
            'property', 'plant', 'equipment', 'goodwill', 'intangible',
            
            # Cash Flow - High Priority
            'cash flow', 'operating activities', 'investing activities', 'financing activities',
            'capital expenditures', 'dividends', 'stock repurchase',
            
            # Common Financial Terms
            'total', 'current', 'noncurrent', 'long term', 'short term', 'accrued', 'deferred'
        ]
        
        # Score each label based on priority keywords
        scored_labels = []
        for label in unique_labels:
            if not label:
                continue
            score = 0
            label_lower = label.lower()
            
            # Check for priority keywords
            for keyword in priority_keywords:
                if keyword in label_lower:
                    score += 1
            
            # Bonus points for key financial items
            if any(key in label_lower for key in ['net income', 'revenue', 'cash', 'assets', 'liabilities', 'equity']):
                score += 2
            
            scored_labels.append((label, score))
        
        # Sort by score (highest first) and take top 80
        scored_labels.sort(key=lambda x: x[1], reverse=True)
        final_labels = [label for label, score in scored_labels[:80]]
        
        print(f"🔍 Generating flow explanations for {len(final_labels)} prioritized line items out of {len(unique_labels)} total")
        
        prompt = f"""
        Analyze the financial data for {ticker} and explain how specific line items flow between financial statements.
        
        INCOME STATEMENT:
        {self._format_financial_data(income_statement)}
        
        BALANCE SHEET:
        {self._format_financial_data(balance_sheet)}
        
        CASH FLOW STATEMENT:
        {self._format_financial_data(cash_flow)}
        
        Provide explanations for the following specific line items showing how they connect between statements:
        {', '.join(final_labels)}
        
        For each line item, explain:
        - How it flows between Income Statement, Balance Sheet, and Cash Flow Statement
        - What other line items it affects or is affected by
        - The business implications of these connections
        
        Format as: "Exact Line Item Label: Explanation of how this flows between statements      
        Use the exact line item labels as provided above.
        """
        
        return prompt

    def _parse_flow_explanations(self, response_text: str) -> Dict[str, str]:
        """Parse flow explanations from AI response"""
        explanations = {}
        
        # Split by lines and process
        lines = response_text.split('\n')
        current_item = None
        current_explanation = ""
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Look for different patterns that indicate a new line item
            # Pattern 1: "Item Name": "explanation"
            if ':' in line and ('"' in line or "'" in line):
                # Save previous item if exists
                if current_item and current_explanation:
                    explanations[current_item] = current_explanation.strip()
                
                # Parse new item
                parts = line.split(':', 1)
                if len(parts) == 2:
                    item_name = parts[0].strip().strip('"').strip("'")
                    explanation = parts[1].strip().strip('"').strip("'")
                    if item_name and explanation:
                        current_item = item_name
                        current_explanation = explanation
                    else:
                        current_item = None
                        current_explanation = ""
            
            # Pattern 2: "Item Name" - explanation
            elif ' - ' in line and line.count('"') >= 2:
                # Save previous item if exists
                if current_item and current_explanation:
                    explanations[current_item] = current_explanation.strip()
                
                # Parse new item
                parts = line.split(' - ', 1)
                if len(parts) == 2:
                    item_name = parts[0].strip().strip('"').strip("'")
                    explanation = parts[1].strip()
                    if item_name and explanation:
                        current_item = item_name
                        current_explanation = explanation
                    else:
                        current_item = None
                        current_explanation = ""
            
            # Pattern 3: Just a line item name (followed by explanation on next lines)
            elif line.endswith(':') and not line.startswith('"'):
                # Save previous item if exists
                if current_item and current_explanation:
                    explanations[current_item] = current_explanation.strip()
                
                # Start new item
                item_name = line[:-1].strip()  # Remove the colon
                current_item = item_name
                current_explanation = ""
            
            # Continue explanation for current item
            elif current_item and line:
                if current_explanation:
                    current_explanation += " " + line
                else:
                    current_explanation = line
        
        # Save the last item
        if current_item and current_explanation:
            explanations[current_item] = current_explanation.strip()
        
        # Debug: Print what we parsed
        print(f"🔍 Parsed flow explanations: {len(explanations)} items")
        for item, explanation in list(explanations.items())[:3]:  # Show first 3
            print(f"  {item}: {explanation[:100]}...")
        
        return explanations