import React, { useState } from 'react';
import { TrendingUp, BarChart3, Users, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface PeerGroupComparisonProps {
  results: any; // Using any for now since we're adding new data structure
  tickers: string[];
  periods: string[];
}

interface MetricData {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
}

interface CompanyMetrics {
  ticker: string;
  companyName: string;
  metrics: {
    [key: string]: MetricData;
  };
}

const PeerGroupComparison: React.FC<PeerGroupComparisonProps> = ({ results, tickers, periods }) => {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  // Define all the key metrics
  const keyMetrics = [
    { key: 'revenue', label: 'Revenue', unit: '$M', category: 'Income Statement' },
    { key: 'gross_profit_margin', label: 'Gross Profit Margin', unit: '%', category: 'Profitability' },
    { key: 'earnings_per_share', label: 'Earnings Per Share', unit: '$', category: 'Profitability' },
    { key: 'net_working_capital_ratio', label: 'Net Working Capital Ratio', unit: '', category: 'Liquidity' },
    { key: 'current_ratio', label: 'Current Ratio', unit: '', category: 'Liquidity' },
    { key: 'quick_ratio', label: 'Quick Ratio', unit: '', category: 'Liquidity' },
    { key: 'cash_ratio', label: 'Cash Ratio', unit: '', category: 'Liquidity' },
    { key: 'debt_to_equity', label: 'Debt to Equity', unit: '', category: 'Leverage' },
    { key: 'debt_to_total_capitalization', label: 'Debt to Total Capitalization', unit: '', category: 'Leverage' },
    { key: 'total_assets_to_equity', label: 'Total Assets/Equity', unit: '', category: 'Leverage' },
    { key: 'book_value', label: 'Book Value', unit: '$', category: 'Valuation' },
    { key: 'tangible_book_value', label: 'Tangible Book Value', unit: '$', category: 'Valuation' },
    { key: 'inventory_turnover', label: 'Inventory Turnover', unit: 'x', category: 'Efficiency' },
    { key: 'receivables_ratio', label: 'Receivables Ratio', unit: '', category: 'Efficiency' },
    { key: 'operating_cash_flow_to_net_income', label: 'Operating Cash Flow/Net Income', unit: '', category: 'Cash Flow' },
    { key: 'capex_to_depreciation', label: 'Capex/Depreciation', unit: '', category: 'Cash Flow' },
    { key: 'pre_tax_margins', label: 'Pre-tax Margins', unit: '%', category: 'Profitability' },
    { key: 'net_margin', label: 'Net Margin', unit: '%', category: 'Profitability' },
    { key: 'ebitda_margin', label: 'EBITDA Margin', unit: '%', category: 'Profitability' },
    { key: 'roa', label: 'ROA', unit: '%', category: 'Returns' },
    { key: 'roe', label: 'ROE', unit: '%', category: 'Returns' },
    { key: 'return_on_invested_capital', label: 'Return on Invested Capital', unit: '%', category: 'Returns' },
    { key: 'interest_coverage_ratio', label: 'Interest Coverage Ratio', unit: 'x', category: 'Leverage' }
  ];

  const handleExport = async () => {
    if (!user || user.tier !== 'paid') {
      alert('Export functionality is only available for paid subscribers. Please upgrade your subscription.');
      return;
    }

    setIsExporting(true);
    try {
      // For peer group analysis, we don't have a single report ID
      // This would need to be implemented differently - for now, show a message
      alert('Export for peer group analysis is not yet implemented. Please use single company analysis for export functionality.');
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Extract data from backend-calculated ratios
  const extractCompanyData = (): CompanyMetrics[] => {
    console.log('🔍 DEBUG: Full results object:', results);
    console.log('🔍 DEBUG: Results keys:', Object.keys(results || {}));
    
    if (!results) {
      console.log('❌ No results object found');
      return [];
    }
    
    if (!results.calculated_ratios) {
      console.log('❌ No calculated_ratios found in results');
      console.log('Available keys:', Object.keys(results));
      return [];
    }
    
    console.log('🔍 DEBUG: calculated_ratios structure:', results.calculated_ratios);
    console.log('🔍 DEBUG: calculated_ratios keys:', Object.keys(results.calculated_ratios));
    
    if (!results.calculated_ratios.peer_group_ratios) {
      console.log('❌ No peer_group_ratios found in calculated_ratios');
      return [];
    }

    return tickers.map(ticker => {
      const companyRatios = results.calculated_ratios.peer_group_ratios[ticker];
      console.log(`🔍 DEBUG: Company ratios for ${ticker}:`, companyRatios);
      
      if (!companyRatios) {
        console.log(`No ratios found for ticker: ${ticker}`);
        return {
          ticker,
          companyName: `${ticker} Company`,
          metrics: {}
        };
      }

      const metrics: { [key: string]: MetricData } = {};
      
      // Get ratios from the first period (for single period view)
      const firstPeriod = periods[0];
      let ratiosData;
      
      if (companyRatios.periods && companyRatios.periods[firstPeriod]) {
        // Multi-period data structure
        ratiosData = companyRatios.periods[firstPeriod].ratios;
        console.log(`📊 Multi-period ratios for ${ticker} period ${firstPeriod}:`, ratiosData);
      } else if (companyRatios.ratios) {
        // Single period data structure
        ratiosData = companyRatios.ratios;
        console.log(`📊 Single-period ratios for ${ticker}:`, ratiosData);
      }

      if (ratiosData) {
        console.log(`📊 Backend ratios for ${ticker}:`, ratiosData);
        
        // Helper function to convert backend ratio to frontend format
        const convertRatioToMetric = (ratioKey: string, ratioData: any) => {
          if (ratioData && typeof ratioData.value === 'number') {
            return {
              current: ratioData.value,
              previous: 0, // Will be calculated if we have multiple periods
              change: 0,
              changePercent: 0
            };
          }
          return null;
        };

        // Map backend ratio keys to frontend metric keys
        const ratioMapping: { [key: string]: string } = {
          'revenue': 'revenue',
          'gross_profit_margin': 'gross_profit_margin',
          'operating_margin': 'pre_tax_margins', // Using pre_tax_margins for operating margin
          'net_margin': 'net_margin',
          'ebitda_margin': 'ebitda_margin',
          'current_ratio': 'current_ratio',
          'quick_ratio': 'quick_ratio',
          'cash_ratio': 'cash_ratio',
          'debt_to_equity': 'debt_to_equity',
          'debt_to_total_capitalization': 'debt_to_total_capitalization',
          'total_assets_to_equity': 'total_assets_to_equity',
          'roe': 'roe',
          'roa': 'roa',
          'roic': 'return_on_invested_capital',
          'interest_coverage': 'interest_coverage_ratio',
          'inventory_turnover': 'inventory_turnover',
          'receivables_ratio': 'receivables_ratio',
          'operating_cash_flow_to_net_income': 'operating_cash_flow_to_net_income',
          'capex_to_depreciation': 'capex_to_depreciation',
          'book_value': 'book_value',
          'tangible_book_value': 'tangible_book_value',
          'net_working_capital_ratio': 'net_working_capital_ratio',
          'earnings_per_share': 'earnings_per_share'
        };

        // Convert backend ratios to frontend metrics
        Object.entries(ratioMapping).forEach(([backendKey, frontendKey]) => {
          const ratioData = ratiosData[backendKey];
          const metricData = convertRatioToMetric(backendKey, ratioData);
          if (metricData) {
            metrics[frontendKey] = metricData;
            console.log(`✅ Mapped ${backendKey} to ${frontendKey}: ${metricData.current}`);
          }
        });
      } else {
        console.log(`No ratios data found for ${ticker}:`, ratiosData);
      }

      console.log(`📊 Final metrics for ${ticker}:`, metrics);

      return {
        ticker,
        companyName: companyRatios.company_name || `${ticker} Company`,
        metrics
      };
    });
  };

  const companyData = extractCompanyData();

  const formatValue = (value: number, unit: string) => {
    if (unit === '%') return `${value.toFixed(2)}%`;
    if (unit === '$') return `$${value.toFixed(2)}`;
    if (unit === '$M') return `$${(value / 1000000).toFixed(2)}M`;
    if (unit === 'x') return `${value.toFixed(2)}x`;
    return value.toFixed(2);
  };

  const formatChange = (change: number, changePercent: number) => {
    const isPositive = change >= 0;
    const color = isPositive ? 'text-green-600' : 'text-red-600';
    const arrow = isPositive ? '↑' : '↓';
    
    return (
      <div className={`text-sm ${color}`}>
        <div className="flex items-center">
          <span className="mr-1">{arrow}</span>
          <span>{formatValue(Math.abs(change), '')}</span>
        </div>
        <div className="text-xs opacity-75">
          {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
        </div>
      </div>
    );
  };

  const getMetricValue = (company: CompanyMetrics, metricKey: string) => {
    const metric = company.metrics[metricKey];
    if (!metric) return { current: 'N/A', change: null };
    
    const metricInfo = keyMetrics.find(m => m.key === metricKey);
    return {
      current: formatValue(metric.current, metricInfo?.unit || ''),
      change: formatChange(metric.change, metric.changePercent)
    };
  };

  const groupedMetrics = keyMetrics.reduce((acc, metric) => {
    if (!acc[metric.category]) {
      acc[metric.category] = [];
    }
    acc[metric.category].push(metric);
    return acc;
  }, {} as { [key: string]: typeof keyMetrics });

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
      <div className="border-b border-gray-200 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Peer Group Comparison
            </h2>
            <p className="text-gray-600">
              {tickers.join(', ')} • {results.report_type} • {periods.join(', ')} • Generated {new Date().toLocaleString()}
            </p>
          </div>
          {user?.tier === 'paid' && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
            >
              <Download className="h-4 w-4" />
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <TrendingUp className="h-6 w-6 text-green-600 mr-2" />
          <h3 className="text-xl font-semibold text-gray-900">Executive Summary</h3>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-gray-700 leading-relaxed">{results.executive_summary}</p>
        </div>
      </div>

      {/* Combined Metrics Table */}
      <div className="mb-8">
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  Metric
                </th>
                {companyData.map((company: CompanyMetrics) => (
                  <th key={company.ticker} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                    <div className="font-semibold">{company.ticker}</div>
                    <div className="text-xs text-gray-400">{company.companyName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {Object.entries(groupedMetrics).map(([category, metrics]) => (
                <React.Fragment key={category}>
                  {/* Category Header Row */}
                  <tr className="bg-gray-100">
                    <td colSpan={companyData.length + 1} className="px-4 py-2">
                      <div className="flex items-center">
                        <Users className="h-4 w-4 text-blue-600 mr-2" />
                        <h4 className="text-sm font-semibold text-gray-900">{category}</h4>
                      </div>
                    </td>
                  </tr>
                  {/* Metrics Rows */}
                  {metrics.map((metric) => (
                    <tr key={metric.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 border-r">
                        <div className="font-semibold">{metric.label}</div>
                        <div className="text-xs text-gray-500">{metric.unit}</div>
                      </td>
                      {companyData.map((company: CompanyMetrics) => {
                        const { current, change } = getMetricValue(company, metric.key);
                        return (
                          <td key={`${company.ticker}-${metric.key}`} className="px-4 py-3 text-center text-sm text-gray-900">
                            <div className="font-semibold">{current}</div>
                            {change && (
                              <div className="mt-1">
                                {change}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Additional Analysis Sections */}
      <div className="grid md:grid-cols-2 gap-8 mt-8">
        {/* Revenue Trends */}
        <div>
          <div className="flex items-center mb-4">
            <BarChart3 className="h-6 w-6 text-green-600 mr-2" />
            <h3 className="text-xl font-semibold text-gray-900">Revenue & Profitability Trends</h3>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
            <p className="text-gray-700">{results.revenue_trends}</p>
          </div>
        </div>

        {/* Risk Assessment */}
        <div>
          <div className="flex items-center mb-4">
            <Users className="h-6 w-6 text-red-600 mr-2" />
            <h3 className="text-xl font-semibold text-gray-900">Risk Assessment</h3>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border-l-4 border-red-500">
            <p className="text-gray-700">{results.risk_assessment}</p>
          </div>
        </div>
      </div>

      {/* Technical Details */}
      <div className="border-t border-gray-200 pt-4 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <div>
            <span className="font-medium">Model Used:</span> {results.openai_model_used}
          </div>
          <div>
            <span className="font-medium">Tokens Used:</span> {results.tokens_used.toLocaleString()}
          </div>
          <div>
            <span className="font-medium">Processing Time:</span> {results.processing_time}ms
          </div>
        </div>
      </div>
    </div>
  );
};

export default PeerGroupComparison; 