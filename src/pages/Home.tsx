import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Search, TrendingUp, Users, Calendar, FileText, Download } from 'lucide-react';
import { analysisAPI } from '../services/api';
import { AnalysisResult, HistoricalTrendsResult } from '../types';
import AnalysisResults from '../components/AnalysisResults';
import TrendFinancialStatements from '../components/TrendFinancialStatements';
import PeerGroupComparison from '../components/PeerGroupComparison';

const Home: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [tickers, setTickers] = useState<string[]>(['']);
  const [analysisType, setAnalysisType] = useState<'single' | 'peer_group'>('single');
  const [periods, setPeriods] = useState<string[]>(['2023']);
  const [reportType, setReportType] = useState('10-K');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null);
  const [trendResults, setTrendResults] = useState<HistoricalTrendsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const addTicker = () => {
    setTickers([...tickers, '']);
  };

  const removeTicker = (index: number) => {
    if (tickers.length > 1) {
      setTickers(tickers.filter((_, i) => i !== index));
    }
  };

  const updateTicker = (index: number, value: string) => {
    const newTickers = [...tickers];
    newTickers[index] = value.toUpperCase();
    setTickers(newTickers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validTickers = tickers.filter(t => t.trim());
    if (validTickers.length === 0) {
      alert('Please enter at least one ticker symbol');
      return;
    }

    setIsLoading(true);
    setAnalysisResults(null);

    try {
      console.log('Submitting analysis request:', {
        tickers: validTickers,
        analysisType,
        periods,
        reportType
      });

      if (analysisType === 'single') {
        // Single company analysis with multiple periods
        const validPeriods = periods.filter(p => p.trim());
        if (validPeriods.length === 1) {
          // Single period analysis
          const result = await analysisAPI.analyzeFinancialData(
            validTickers[0],
            reportType,
            validPeriods[0]
          );
          console.log('Single period analysis result:', result);
          setAnalysisResults(result);
          setTrendResults(null);
        } else {
          // Multi-period analysis
          const result = await analysisAPI.getMultiPeriodAnalysis(
            validTickers[0],
            reportType,
            validPeriods
          );
          console.log('Multi-period analysis result:', result);
          setTrendResults(result);
          setAnalysisResults(null);
        }
      } else {
        // Peer group analysis
        const result = await analysisAPI.getPeerGroupAnalysis(
          validTickers,
          reportType,
          periods.filter(p => p.trim())
        );
        console.log('Peer group analysis result:', result);
        setTrendResults(result);
        setAnalysisResults(null);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Analysis failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Analysis Form - Horizontally oriented at top third */}
      {isAuthenticated && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="card">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Financial Analysis
              </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Horizontal Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Analysis Type Toggle */}
                <div className="lg:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Analysis Type</label>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setAnalysisType('single')}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        analysisType === 'single'
                          ? 'bg-white text-primary-600 shadow-sm'
                          : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-1">
                        <TrendingUp className="h-4 w-4" />
                        <span>Single</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnalysisType('peer_group')}
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        analysisType === 'peer_group'
                          ? 'bg-white text-primary-600 shadow-sm'
                          : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-1">
                        <Users className="h-4 w-4" />
                        <span>Peer Group</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Ticker Input */}
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company Tickers</label>
                  <div className="space-y-2">
                    {tickers.map((ticker, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <div className="flex-1">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                              type="text"
                              value={ticker}
                              onChange={(e) => updateTicker(index, e.target.value)}
                              placeholder="Enter ticker (e.g., AAPL)"
                              className="input-field pl-10"
                            />
                          </div>
                        </div>
                        {tickers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTicker(index)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {analysisType === 'peer_group' && (
                      <button
                        type="button"
                        onClick={addTicker}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                      >
                        + Add Company
                      </button>
                    )}
                  </div>
                </div>

                {/* Date Range */}
                <div className="lg:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Period</label>
                  <div className="space-y-2">
                    {periods.map((period, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={period}
                            onChange={(e) => {
                              const newPeriods = [...periods];
                              newPeriods[index] = e.target.value;
                              setPeriods(newPeriods);
                            }}
                            placeholder="e.g., 2023"
                            className="input-field"
                          />
                        </div>
                        {periods.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPeriods(periods.filter((_, i) => i !== index));
                            }}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPeriods([...periods, ''])}
                      className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      + Add Period
                    </button>
                  </div>
                </div>
              </div>

              {/* Second Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Report Type */}
                <div className="lg:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Report Type</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="input-field"
                  >
                    <option value="10-K">10-K (Annual Report)</option>
                    <option value="10-Q">10-Q (Quarterly Report)</option>
                    <option value="8-K">8-K (Current Report)</option>
                  </select>
                </div>

                {/* Submit Button */}
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">&nbsp;</label>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full py-3 text-base font-medium rounded-lg transition-colors ${
                      isLoading 
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : 'btn-primary'
                    }`}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Analyzing...
                      </div>
                    ) : (
                      'Analyze Financial Data'
                    )}
                  </button>
                </div>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResults && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AnalysisResults
            results={analysisResults}
            ticker={tickers.filter(t => t.trim())[0]}
            reportType={reportType}
            period={periods[0]}
          />
        </div>
      )}

      {/* Trend Analysis Results */}
      {trendResults && analysisType === 'single' && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="border-b border-gray-200 pb-4 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Trend Analysis for {trendResults.company_ticker}
                  </h2>
                  <p className="text-gray-600">
                    {trendResults.company_name} • {trendResults.report_type} • {trendResults.available_years.join(', ')} • Generated {new Date().toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <TrendFinancialStatements
              results={trendResults}
              ticker={trendResults.company_ticker}
              reportType={trendResults.report_type}
            />
          </div>
        </div>
      )}

      {/* Peer Group Comparison Results */}
      {trendResults && analysisType === 'peer_group' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <PeerGroupComparison 
            results={trendResults}
            tickers={tickers.filter(t => t.trim())}
            periods={periods.filter(p => p.trim())}
          />
        </div>
      )}

      {/* Features Section - Commented out as requested */}
      {/* 
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Powerful Financial Analysis Features
            </h2>
            <p className="text-lg text-gray-600">
              Everything you need to make informed investment decisions
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="bg-primary-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <TrendingUp className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                AI-Powered Analysis
              </h3>
              <p className="text-gray-600">
                Advanced AI algorithms analyze financial data to provide comprehensive insights and recommendations.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-primary-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Users className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Peer Group Comparison
              </h3>
              <p className="text-gray-600">
                Compare multiple companies side-by-side to identify industry leaders and investment opportunities.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-primary-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <FileText className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                SEC Data Integration
              </h3>
              <p className="text-gray-600">
                Direct access to official SEC filings with real-time data updates and comprehensive coverage.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-primary-100 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Download className="h-8 w-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                CSV Export (Pro)
              </h3>
              <p className="text-gray-600">
                Export financial statements to CSV format with separate sections for balance sheet, income statement, and cash flow.
              </p>
            </div>
          </div>
        </div>
      </div>
      */}
    </div>
  );
};

export default Home; 