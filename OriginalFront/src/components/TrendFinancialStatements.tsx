import React, { useState } from 'react';
import { TrendingUp, AlertTriangle, Activity, BarChart3 } from 'lucide-react';
import { HistoricalTrendsResult } from '../types';

interface TrendFinancialStatementsProps {
  results: HistoricalTrendsResult;
  ticker: string;
  reportType: string;
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
  data: { [period: string]: any };
  analysis?: string;
  periods: string[];
  lineItemTrends?: { [key: string]: string };
}

const LineItem: React.FC<LineItemProps> = ({ concept, data, analysis, periods, lineItemTrends }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Get the label from the first available period
  const firstPeriodData = Object.values(data)[0];
  const label = firstPeriodData?.label || concept;
  
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
        <div className="flex space-x-4">
          {periods.map((period) => {
            const periodData = data[period];
            const value = periodData?.value || 'N/A';
            const unit = periodData?.unit || '';
            
            return (
              <div key={period} className="text-right min-w-[80px]">
                <div className="text-xs text-gray-500 mb-1">{period}</div>
                <div className="text-sm font-semibold text-gray-900">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </div>
                {unit && <div className="text-xs text-gray-500">{unit}</div>}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Tooltip with trend analysis */}
      {showTooltip && (analysis || lineItemTrends?.[label] || lineItemTrends?.[concept]) && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-md">
          <div className="text-sm text-gray-700 leading-relaxed">
            {(lineItemTrends?.[label] || lineItemTrends?.[concept]) && (
              <div>
                <div className="font-semibold text-gray-900 mb-2">Business Implication:</div>
                <div>{lineItemTrends[label] || lineItemTrends[concept]}</div>
              </div>
            )}
            {analysis && !lineItemTrends?.[label] && !lineItemTrends?.[concept] && (
              <div>
                <div className="font-semibold text-gray-900 mb-2">Trend Analysis:</div>
                <div>{analysis}</div>
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
  data: { [period: string]: FinancialData };
  analysis?: string;
  color: string;
  periods: string[];
  lineItemTrends?: { [key: string]: string };
  subsections?: {
    title: string;
    keywords: string[];
    items: { [period: string]: any };
  }[];
}

const StatementSection: React.FC<StatementSectionProps> = ({ 
  title, 
  icon, 
  data, 
  analysis, 
  color, 
  periods,
  lineItemTrends,
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
                {Object.entries(subsection.items).map(([concept, periodData]) => {
                  return (
                    <LineItem
                      key={concept}
                      concept={concept}
                      data={periodData}
                      analysis={analysis}
                      periods={periods}
                      lineItemTrends={lineItemTrends}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {(() => {
            // Combine data across periods to get unique concepts
            const allConcepts = new Set<string>();
            Object.values(data).forEach(periodData => {
              Object.keys(periodData).forEach(concept => allConcepts.add(concept));
            });
            
            return Array.from(allConcepts).map((concept) => {
              const periodData: { [period: string]: any } = {};
              periods.forEach(period => {
                periodData[period] = data[period]?.[concept];
              });
              
              return (
                <LineItem
                  key={concept}
                  concept={concept}
                  data={periodData}
                  analysis={analysis}
                  periods={periods}
                  lineItemTrends={lineItemTrends}
                />
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};

const TrendFinancialStatements: React.FC<TrendFinancialStatementsProps> = ({
  results,
  ticker,
  reportType
}) => {
  const periods = results.available_years;
  const lineItemTrends = results.line_item_trends || {};
  
  // Organize data by statement type
  const incomeStatementData: { [period: string]: FinancialData } = {};
  const balanceSheetData: { [period: string]: FinancialData } = {};
  const cashFlowData: { [period: string]: FinancialData } = {};

  // Extract data from historical_data
  periods.forEach(period => {
    const periodData = results.historical_data[period];
    if (periodData) {
      incomeStatementData[period] = periodData.income_statement || {};
      balanceSheetData[period] = periodData.balance_sheet || {};
      cashFlowData[period] = periodData.cash_flow || {};
    }
  });

  // Helper function to filter US-GAAP items (matching export logic exactly)
  const filterUsGaap = (items: FinancialData) => {
    return Object.fromEntries(
      Object.entries(items).filter(([key]) => key.toLowerCase().startsWith('us-gaap'))
    );
  };

  // Helper function to organize items by sections (matching export logic exactly)
  const organizeItemsBySections = (items: FinancialData, sections: Array<{title: string, keywords: string[]}>) => {
    const organizedSections: Array<{title: string, keywords: string[], items: { [period: string]: any } }> = [];
    const usedConcepts = new Set<string>();
    
    // Process each section in order
    for (const section of sections) {
      const sectionItems: { [period: string]: any } = {};
      
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
              sectionItems[concept] = data;
              usedConcepts.add(concept);
            }
          }
        }
      }
      
      // Only add section if it has items
      if (Object.keys(sectionItems).length > 0) {
        organizedSections.push({
          title: section.title,
          keywords: section.keywords,
          items: sectionItems
        });
      }
    }
    
    // Add remaining uncategorized items
    const remainingItems: { [period: string]: any } = {};
    for (const [concept, data] of Object.entries(items)) {
      if (!usedConcepts.has(concept)) {
        remainingItems[concept] = data;
      }
    }
    
    if (Object.keys(remainingItems).length > 0) {
      organizedSections.push({
        title: 'OTHER ITEMS',
        keywords: [],
        items: remainingItems
      });
    }
    
    return organizedSections;
  };

  // Helper function to organize items by sections for multi-period data
  const organizeItemsBySectionsMultiPeriod = (data: { [period: string]: FinancialData }, sections: Array<{title: string, keywords: string[]}>) => {
    const organizedSections: Array<{title: string, keywords: string[], items: { [period: string]: any } }> = [];
    const usedConcepts = new Set<string>();
    
    // Get the first period's data to organize sections
    const firstPeriodData = data[periods[0]] || {};
    const filteredData = filterUsGaap(firstPeriodData);
    
    // Process each section in order
    for (const section of sections) {
      const sectionItems: { [period: string]: any } = {};
      
      // Find items that match this section's keywords
      for (const [concept, itemData] of Object.entries(filteredData)) {
        if (!usedConcepts.has(concept)) {
          const label = itemData?.label || concept;
          if (label) {
            const labelLower = label.toLowerCase();
            // Check if this item matches any keyword in the section
            const matchesSection = section.keywords.some(keyword => {
              const keywordLower = keyword.toLowerCase();
              // More precise matching to avoid false positives
              if (section.title === 'OPERATING INCOME') {
                return (
                  (keywordLower === 'operating income' && labelLower.includes('operating income')) ||
                  (keywordLower === 'operating profit' && labelLower.includes('operating profit')) ||
                  (keywordLower === 'ebit' && labelLower.includes('ebit')) ||
                  (keywordLower === 'earnings before interest and taxes' && labelLower.includes('earnings before interest and taxes')) ||
                  (keywordLower === 'income from operations' && labelLower.includes('income from operations'))
                ) && !labelLower.includes('nonoperating') && !labelLower.includes('non-operating');
              } else if (section.title === 'NET INCOME') {
                return (
                  (keywordLower === 'net income' && labelLower.includes('net income')) ||
                  (keywordLower === 'net earnings' && labelLower.includes('net earnings')) ||
                  (keywordLower === 'net profit' && labelLower.includes('net profit')) ||
                  (keywordLower === 'net income loss' && labelLower.includes('net income loss'))
                ) && !labelLower.includes('operating income') && !labelLower.includes('other income');
              } else if (section.title === 'OTHER INCOME (EXPENSE)') {
                return (
                  labelLower.includes(keywordLower) && 
                  !labelLower.includes('net income') && 
                  !labelLower.includes('net earnings') && 
                  !labelLower.includes('net profit')
                );
              } else {
                return labelLower.includes(keywordLower);
              }
            });
            
                         if (matchesSection) {
               // Create multi-period data for this concept
               const multiPeriodData: { [period: string]: any } = {};
               periods.forEach(period => {
                 const dataByPeriod = data as { [period: string]: FinancialData };
                 const periodData = (dataByPeriod[period] || {}) as FinancialData;
                 if (periodData && periodData[concept]) {
                   multiPeriodData[period] = periodData[concept];
                 }
               });
              
              if (Object.keys(multiPeriodData).length > 0) {
                sectionItems[concept] = multiPeriodData;
                usedConcepts.add(concept);
              }
            }
          }
        }
      }
      
      // Only add section if it has items
      if (Object.keys(sectionItems).length > 0) {
        organizedSections.push({
          title: section.title,
          keywords: section.keywords,
          items: sectionItems
        });
      }
    }
    
    // Add remaining uncategorized items
    const remainingItems: { [period: string]: any } = {};
    for (const [concept, itemData] of Object.entries(filteredData)) {
             if (!usedConcepts.has(concept)) {
         const multiPeriodData: { [period: string]: any } = {};
         periods.forEach(period => {
           const dataByPeriod = data as { [period: string]: FinancialData };
           const periodData = (dataByPeriod[period] || {}) as FinancialData;
           if (periodData && periodData[concept]) {
             multiPeriodData[period] = periodData[concept];
           }
         });
        
        if (Object.keys(multiPeriodData).length > 0) {
          remainingItems[concept] = multiPeriodData;
        }
      }
    }
    
    if (Object.keys(remainingItems).length > 0) {
      organizedSections.push({
        title: 'OTHER ITEMS',
        keywords: [],
        items: remainingItems
      });
    }
    
    return organizedSections;
  };

  // Organize income statement data (matching export logic exactly)
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
  const incomeSubsections = organizeItemsBySectionsMultiPeriod(incomeStatementData, incomeStatementSections);

  // Organize balance sheet data (matching export logic exactly)
  const balanceSheetSections = [
    { title: 'ASSETS', keywords: ['total assets'] },
    { title: 'CURRENT ASSETS', keywords: ['current assets', 'cash and cash equivalents', 'cash', 'short term investments', 'marketable securities', 'accounts receivable', 'receivables', 'inventory', 'prepaid expenses', 'prepaid', 'other current assets'] },
    { title: 'NON-CURRENT ASSETS', keywords: ['non current assets', 'property plant and equipment', 'ppe', 'fixed assets', 'accumulated depreciation', 'intangible assets', 'goodwill', 'other assets'] },
    { title: 'LIABILITIES', keywords: ['total liabilities'] },
    { title: 'CURRENT LIABILITIES', keywords: ['current liabilities', 'accounts payable', 'payables', 'accrued liabilities', 'accrued expenses', 'short term debt', 'current debt', 'other current liabilities'] },
    { title: 'NON-CURRENT LIABILITIES', keywords: ['non current liabilities', 'long term debt', 'long term borrowings', 'deferred tax liabilities', 'other liabilities'] },
    { title: 'SHAREHOLDERS\' EQUITY', keywords: ['total equity', 'stockholders equity', 'shareholders equity', 'common stock', 'capital stock', 'additional paid in capital', 'paid in capital', 'retained earnings', 'accumulated earnings', 'treasury stock', 'other equity', 'comprehensive income', 'accumulated other comprehensive income'] }
  ];
  const balanceSheetSubsections = organizeItemsBySectionsMultiPeriod(balanceSheetData, balanceSheetSections);

  // Organize cash flow data (matching export logic exactly)
  const cashFlowSections = [
    { title: 'CASH AND CASH EQUIVALENTS', keywords: ['cash and cash equivalents', 'cash', 'cash equivalents'] },
    { title: 'OPERATING ACTIVITIES', keywords: ['net income', 'depreciation and amortization', 'depreciation', 'stock based compensation', 'deferred taxes', 'changes in working capital', 'accounts receivable', 'inventory', 'accounts payable', 'other operating activities', 'net cash from operating activities'] },
    { title: 'INVESTING ACTIVITIES', keywords: ['capital expenditures', 'capex', 'acquisitions', 'business acquisitions', 'investments', 'other investing activities', 'net cash from investing activities'] },
    { title: 'FINANCING ACTIVITIES', keywords: ['debt issuance', 'borrowings', 'debt repayment', 'stock issuance', 'common stock issued', 'stock repurchases', 'treasury stock', 'dividends paid', 'other financing activities', 'net cash from financing activities'] },
    { title: 'NET CHANGE IN CASH', keywords: ['net change in cash', 'cash at beginning of period', 'cash at end of period'] }
  ];
  const cashFlowSubsections = organizeItemsBySectionsMultiPeriod(cashFlowData, cashFlowSections);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="border-b border-gray-200 pb-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Historical Financial Statements for {ticker}
        </h2>
        <p className="text-gray-600">
          {reportType} • {periods.join(', ')} • Trend Analysis
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Hover over any line item to see trend analysis
        </p>
      </div>

      <div className="space-y-6">
        {/* Income Statement */}
        <StatementSection
          title="Income Statement"
          icon={<TrendingUp className="h-5 w-5 text-green-600" />}
          data={incomeStatementData}
          analysis={results.revenue_trends}
          color="border-green-500"
          periods={periods}
          lineItemTrends={lineItemTrends}
          subsections={incomeSubsections}
        />

        {/* Balance Sheet */}
        <StatementSection
          title="Balance Sheet"
          icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
          data={balanceSheetData}
          analysis={results.balance_sheet_trends}
          color="border-blue-500"
          periods={periods}
          lineItemTrends={lineItemTrends}
          subsections={balanceSheetSubsections}
        />

        {/* Cash Flow Statement */}
        <StatementSection
          title="Cash Flow Statement"
          icon={<Activity className="h-5 w-5 text-purple-600" />}
          data={cashFlowData}
          analysis={results.cash_flow_trends}
          color="border-purple-500"
          periods={periods}
          lineItemTrends={lineItemTrends}
          subsections={cashFlowSubsections}
        />
      </div>

      {/* Analysis Summary */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex items-center mb-4">
          <AlertTriangle className="h-5 w-5 text-orange-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Trend Analysis Summary</h3>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">
          <p className="text-gray-700 leading-relaxed">{results.executive_summary}</p>
        </div>
      </div>
    </div>
  );
};

export default TrendFinancialStatements; 