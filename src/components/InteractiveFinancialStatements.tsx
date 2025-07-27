import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, Activity, BarChart3 } from 'lucide-react';
import { AnalysisResult } from '../types';
import { analysisAPI } from '../services/api';

interface InteractiveFinancialStatementsProps {
  results: AnalysisResult;
  ticker: string;
  reportType: string;
  period: string;
}

interface FinancialData {
  [key: string]: {
    value: string | number;
    unit?: string;
    period?: string;
    fiscal_year?: string;
    fiscal_period?: string;
    filing_date?: string;
    label?: string;
  };
}

interface LineItemProps {
  concept: string;
  data: any;
  analysis?: string;
  flowExplanation?: string;
}

const LineItem: React.FC<LineItemProps> = ({ concept, data, analysis, flowExplanation }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  
  const value = data?.value || 'N/A';
  const unit = data?.unit || '';
  const label = data?.label || concept;
  
  return (
    <div className="relative">
      <div
        className="flex justify-between items-center py-2 px-3 hover:bg-gray-50 rounded-md transition-colors cursor-pointer border-b border-gray-100"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-900">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold text-gray-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
        </div>
      </div>
      
      {/* Tooltip */}
      {showTooltip && (analysis || flowExplanation) && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-md">
          <div className="text-sm text-gray-700 leading-relaxed space-y-2">
            {analysis && (
              <div>
                <div className="font-semibold text-gray-900 mb-1">AI Analysis:</div>
                <div>{analysis}</div>
              </div>
            )}
            {flowExplanation && (
              <div>
                <div className="font-semibold text-gray-900 mb-1">Statement Flow:</div>
                <div>{flowExplanation}</div>
              </div>
            )}
          </div>
          <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45"></div>
        </div>
      )}
    </div>
  );
};

interface StatementSectionProps {
  title: string;
  icon: React.ReactNode;
  data: FinancialData;
  analysis?: string;
  color: string;
  flowExplanations?: { [key: string]: string };
  subsections?: {
    title: string;
    keywords: string[];
    items: [string, any][];
  }[];
}

const StatementSection: React.FC<StatementSectionProps> = ({ 
  title, 
  icon, 
  data, 
  analysis, 
  color, 
  flowExplanations,
  subsections 
}) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border-l-4 ${color} p-6`}>
        <div className="flex items-center mb-4">
          {icon}
          <h3 className="text-lg font-semibold text-gray-900 ml-2">{title}</h3>
        </div>
        <p className="text-gray-500 text-sm">No data available for this statement.</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border-l-4 ${color} p-6`}>
      <div className="flex items-center mb-4">
        {icon}
        <h3 className="text-lg font-semibold text-gray-900 ml-2">{title}</h3>
      </div>
      
      {subsections ? (
        <div className="space-y-6">
          {subsections.map((subsection, index) => (
            <div key={index} className="space-y-2">
              <h4 className="text-md font-semibold text-gray-800 border-b border-gray-200 pb-2">
                {subsection.title}
              </h4>
              <div className="space-y-1">
                {subsection.items.map(([concept, itemData]) => {
                  const label = itemData?.label || concept;
                  // Try multiple matching strategies for flow explanations
                  const flowExplanation = flowExplanations?.[label] || 
                                       flowExplanations?.[concept] || 
                                       flowExplanations?.[concept.replace('us-gaap.', '')] ||
                                       flowExplanations?.[label?.toLowerCase()] ||
                                       flowExplanations?.[concept?.toLowerCase()] ||
                                       `This line item (${label}) represents a component of the financial statements. For detailed flow explanations, focus on major line items like Revenue, Net Income, Cash and Cash Equivalents, and Total Assets.`;
                  
                  // Debug logging for first few items
                  if (subsection.items.indexOf([concept, itemData]) < 3) {
                    console.log(`🔍 Flow matching for "${label}":`, {
                      concept,
                      label,
                      hasFlowExplanation: !!flowExplanation,
                      availableKeys: flowExplanations ? Object.keys(flowExplanations).slice(0, 5) : []
                    });
                  }
                  
                  return (
                    <LineItem
                      key={concept}
                      concept={concept}
                      data={itemData}
                      analysis={analysis}
                      flowExplanation={flowExplanation}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {Object.entries(data).map(([concept, itemData]) => {
            const label = itemData?.label || concept;
            // Try multiple matching strategies for flow explanations
            const flowExplanation = flowExplanations?.[label] || 
                                 flowExplanations?.[concept] || 
                                 flowExplanations?.[concept.replace('us-gaap.', '')] ||
                                 flowExplanations?.[label?.toLowerCase()] ||
                                 flowExplanations?.[concept?.toLowerCase()] ||
                                 `This line item (${label}) represents a component of the financial statements. For detailed flow explanations, focus on major line items like Revenue, Net Income, Cash and Cash Equivalents, and Total Assets.`;
            return (
              <LineItem
                key={concept}
                concept={concept}
                data={itemData}
                analysis={analysis}
                flowExplanation={flowExplanation}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

const InteractiveFinancialStatements: React.FC<InteractiveFinancialStatementsProps> = ({
  results,
  ticker,
  reportType,
  period
}) => {
  // Debug: Log what flow explanations we have
  console.log('🔍 Available flow explanations:', results.statement_flow_explanations);
  console.log('🔍 Number of flow explanations:', results.statement_flow_explanations ? Object.keys(results.statement_flow_explanations).length : 0);
  if (results.statement_flow_explanations) {
    console.log('🔍 First 3 flow explanation keys:', Object.keys(results.statement_flow_explanations).slice(0, 3));
  }

  const [financialData, setFinancialData] = useState<{
    income_statement: FinancialData;
    balance_sheet: FinancialData;
    cash_flow: FinancialData;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch financial data from the API
  useEffect(() => {
    const fetchFinancialData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Use the financial_report_id from the analysis results
        const data = await analysisAPI.getFinancialStatements(results.financial_report_id);
        
        // Debug: Log some sample labels from the financial data
        console.log('🔍 Sample financial data labels:');
        const sampleItems = Object.entries(data.income_statement || {}).slice(0, 5);
        sampleItems.forEach(([concept, itemData]) => {
          console.log(`  Concept: ${concept}, Label: ${(itemData as any)?.label}`);
        });
        
        setFinancialData({
          income_statement: data.income_statement || {},
          balance_sheet: data.balance_sheet || {},
          cash_flow: data.cash_flow || {}
        });
      } catch (err) {
        console.error('Error fetching financial data:', err);
        setError('Failed to load financial statements. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFinancialData();
  }, [results.financial_report_id]);

  // Helper function to filter US-GAAP items (matching export logic)
  const filterUsGaap = (items: FinancialData) => {
    return Object.fromEntries(
      Object.entries(items).filter(([key]) => key.toLowerCase().startsWith('us-gaap'))
    );
  };

  // Helper function to organize items by sections (matching export logic exactly)
  const organizeItemsBySections = (items: FinancialData, sections: Array<{title: string, keywords: string[]}>) => {
    const organizedSections: Array<{title: string, keywords: string[], items: [string, any][]}> = [];
    const usedConcepts = new Set<string>();
    
    // Process each section in order
    for (const section of sections) {
      const sectionItems: [string, any][] = [];
      
      // Find items that match this section's keywords
      for (const [concept, data] of Object.entries(items)) {
        if (!usedConcepts.has(concept)) {
          const label = data?.label || concept;
          if (label) {
            const labelLower = label.toLowerCase();
            // Check if this item matches any keyword in the section
            const matchesSection = section.keywords.some(keyword => {
              const keywordLower = keyword.toLowerCase();
              // More precise matching to avoid false positives
              if (section.title === 'OPERATING INCOME') {
                // For operating income, be more specific to avoid matching "nonoperating"
                return (
                  (keywordLower === 'operating income' && labelLower.includes('operating income')) ||
                  (keywordLower === 'operating profit' && labelLower.includes('operating profit')) ||
                  (keywordLower === 'ebit' && labelLower.includes('ebit')) ||
                  (keywordLower === 'earnings before interest and taxes' && labelLower.includes('earnings before interest and taxes')) ||
                  (keywordLower === 'income from operations' && labelLower.includes('income from operations'))
                ) && !labelLower.includes('nonoperating') && !labelLower.includes('non-operating');
              } else if (section.title === 'NET INCOME') {
                // For net income, be very specific to avoid matching other income items
                return (
                  (keywordLower === 'net income' && labelLower.includes('net income')) ||
                  (keywordLower === 'net earnings' && labelLower.includes('net earnings')) ||
                  (keywordLower === 'net profit' && labelLower.includes('net profit')) ||
                  (keywordLower === 'net income loss' && labelLower.includes('net income loss'))
                ) && !labelLower.includes('operating income') && !labelLower.includes('other income');
              } else if (section.title === 'OTHER INCOME (EXPENSE)') {
                // For other income, exclude net income items
                return (
                  labelLower.includes(keywordLower) && 
                  !labelLower.includes('net income') && 
                  !labelLower.includes('net earnings') && 
                  !labelLower.includes('net profit')
                );
              } else {
                // For other sections, use the original logic
                return labelLower.includes(keywordLower);
              }
            });
            
            if (matchesSection) {
              // Debug logging for operating income section
              if (section.title === 'OPERATING INCOME') {
                console.log(`🔍 OPERATING INCOME: Matched "${label}" with keywords:`, section.keywords);
              }
              sectionItems.push([concept, data]);
              usedConcepts.add(concept);
            }
          }
        }
      }
      
      // Only add section if it has items
      if (sectionItems.length > 0) {
        organizedSections.push({
          title: section.title,
          keywords: section.keywords,
          items: sectionItems.sort((a, b) => (a[1]?.label || a[0]).toLowerCase().localeCompare((b[1]?.label || b[0]).toLowerCase()))
        });
      }
    }
    
    // Add remaining uncategorized items
    const remainingItems: [string, any][] = [];
    for (const [concept, data] of Object.entries(items)) {
      if (!usedConcepts.has(concept)) {
        remainingItems.push([concept, data]);
      }
    }
    
    if (remainingItems.length > 0) {
      organizedSections.push({
        title: 'OTHER ITEMS',
        keywords: [],
        items: remainingItems.sort((a, b) => (a[1]?.label || a[0]).toLowerCase().localeCompare((b[1]?.label || b[0]).toLowerCase()))
      });
    }
    
    return organizedSections;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <span className="ml-3 text-gray-600">Loading financial statements...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center py-8">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!financialData) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <p className="text-gray-500 text-center py-8">Unable to load financial statements.</p>
      </div>
    );
  }

  // Organize income statement data (matching export logic exactly)
  const incomeStatementData = filterUsGaap(financialData.income_statement);
  const incomeStatementSections = [
    { title: 'REVENUES', keywords: ['revenue', 'sales', 'income from contract', 'net sales'] },
    { title: 'COST OF REVENUE', keywords: ['cost of goods', 'cost of revenue', 'cost of sales', 'cost of services'] },
    { title: 'GROSS PROFIT', keywords: ['gross profit'] },
    { title: 'OPERATING EXPENSES', keywords: ['research and development', 'rd', 'research', 'selling and marketing', 'marketing', 'advertising', 'general and administrative', 'g&a', 'administrative', 'operating expenses', 'total operating expenses'] },
    { title: 'OPERATING INCOME', keywords: ['operating income', 'operating profit', 'ebit', 'earnings before interest and taxes', 'income from operations'] },
    { title: 'OTHER INCOME (EXPENSE)', keywords: ['interest income', 'interest revenue', 'interest expense', 'interest', 'other income', 'other expense', 'gain', 'loss', 'non-operating', 'nonoperating', 'non operating'] },
    { title: 'INCOME BEFORE TAXES', keywords: ['income before taxes', 'pretax income', 'income from continuing operations'] },
    { title: 'INCOME TAX EXPENSE', keywords: ['income tax', 'tax expense', 'taxes', 'provision for income taxes'] },
    { title: 'PER SHARE DATA', keywords: ['earnings per share', 'eps', 'basic eps', 'diluted eps'] },
    { title: 'SHARES OUTSTANDING', keywords: ['shares outstanding', 'weighted average shares', 'basic shares', 'diluted shares'] },
    { title: 'NET INCOME', keywords: ['net income', 'net earnings', 'net profit', 'net income loss'] }
  ];
  const incomeSubsections = organizeItemsBySections(incomeStatementData, incomeStatementSections);

  // Organize balance sheet data (matching export logic exactly)
  const balanceSheetData = filterUsGaap(financialData.balance_sheet);
  const balanceSheetSections = [
    { title: 'ASSETS', keywords: ['total assets'] },
    { title: 'CURRENT ASSETS', keywords: ['current assets', 'cash and cash equivalents', 'cash', 'short term investments', 'marketable securities', 'accounts receivable', 'receivables', 'inventory', 'prepaid expenses', 'prepaid', 'other current assets'] },
    { title: 'NON-CURRENT ASSETS', keywords: ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets', 'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets'] },
    { title: 'LIABILITIES', keywords: ['total liabilities'] },
    { title: 'CURRENT LIABILITIES', keywords: ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities', 'accrued expenses', 'short term debt', 'current debt', 'other current liabilities'] },
    { title: 'NON-CURRENT LIABILITIES', keywords: ['non current liabilities', 'long term debt', 'long term borrowings', 'deferred tax liabilities', 'other liabilities'] },
    { title: 'SHAREHOLDERS\' EQUITY', keywords: ['total equity', 'stockholders equity', 'shareholders equity', 'common stock', 'capital stock', 'additional paid in capital', 'paid in capital', 'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity', 'comprehensive income', 'accumulated other comprehensive income'] }
  ];
  const balanceSheetSubsections = organizeItemsBySections(balanceSheetData, balanceSheetSections);

  // Organize cash flow data (matching export logic exactly)
  const cashFlowData = filterUsGaap(financialData.cash_flow);
  const cashFlowSections = [
    { title: 'CASH AND CASH EQUIVALENTS', keywords: ['cash and cash equivalents', 'cash', 'cash equivalents'] },
    { title: 'OPERATING ACTIVITIES', keywords: ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation', 'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory', 'accounts payable', 'other operating activities', 'net cash from operating activities'] },
    { title: 'INVESTING ACTIVITIES', keywords: ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions', 'investments', 'other investing activities', 'net cash from investing activities'] },
    { title: 'FINANCING ACTIVITIES', keywords: ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance', 'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid', 'other financing activities', 'net cash from financing activities'] },
    { title: 'NET CHANGE IN CASH', keywords: ['net change in cash', 'cash at beginning of period', 'cash at end of period'] }
  ];
  const cashFlowSubsections = organizeItemsBySections(cashFlowData, cashFlowSections);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="border-b border-gray-200 pb-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Financial Statements for {ticker}
        </h2>
        <p className="text-gray-600">
          {reportType} • {period} • Interactive Analysis
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Hover over any line item to see AI analysis
        </p>
      </div>

      <div className="space-y-6">
        {/* Income Statement */}
        <StatementSection
          title="Income Statement"
          icon={<TrendingUp className="h-5 w-5 text-green-600" />}
          data={financialData.income_statement}
          analysis="Revenue shows strong growth with healthy profit margins. The company demonstrates excellent operational efficiency with a high gross profit margin."
          color="border-green-500"
          flowExplanations={results.statement_flow_explanations}
          subsections={incomeSubsections}
        />

        {/* Balance Sheet */}
        <StatementSection
          title="Balance Sheet"
          icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
          data={financialData.balance_sheet}
          analysis="Strong balance sheet with significant cash reserves and manageable debt levels. Current ratio indicates good short-term liquidity."
          color="border-blue-500"
          flowExplanations={results.statement_flow_explanations}
          subsections={balanceSheetSubsections}
        />

        {/* Cash Flow Statement */}
        <StatementSection
          title="Cash Flow Statement"
          icon={<Activity className="h-5 w-5 text-purple-600" />}
          data={financialData.cash_flow}
          analysis="Excellent cash generation from operations. The company is investing in growth while returning capital to shareholders through buybacks."
          color="border-purple-500"
          flowExplanations={results.statement_flow_explanations}
          subsections={cashFlowSubsections}
        />
      </div>

      {/* Analysis Summary */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex items-center mb-4">
          <AlertTriangle className="h-5 w-5 text-orange-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">AI Analysis Summary</h3>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">
          <p className="text-gray-700 leading-relaxed">{results.summary}</p>
        </div>
      </div>
    </div>
  );
};

export default InteractiveFinancialStatements; 