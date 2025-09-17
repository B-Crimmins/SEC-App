import React, { useState } from 'react';
import { AnalysisResult } from '../types';
import { TrendingUp, AlertTriangle, Activity, Download, BarChart3, FileText } from 'lucide-react';
import { analysisAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import InteractiveFinancialStatements from './InteractiveFinancialStatements';

interface AnalysisResultsProps {
  results: AnalysisResult;
  ticker: string;
  reportType: string;
  period: string;
}

const AnalysisResults: React.FC<AnalysisResultsProps> = ({ results, ticker, reportType, period }) => {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'analysis' | 'statements'>('analysis');

  const handleExport = async () => {
    if (!user || user.tier !== 'paid') {
      alert('Export functionality is only available for paid subscribers. Please upgrade your subscription.');
      return;
    }

    setIsExporting(true);
    try {
      // Export the financial statements data using the financial report ID
      await analysisAPI.exportFinancialStatements(results.financial_report_id);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
      <div className="border-b border-gray-200 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Analysis Results for {ticker}
            </h2>
            <p className="text-gray-600">
              {reportType} • {period} • Generated {new Date().toLocaleString()}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {/* View Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('analysis')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'analysis'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span>Analysis</span>
                </div>
              </button>
              <button
                onClick={() => setViewMode('statements')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'statements'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4" />
                  <span>Financial Statements</span>
                </div>
              </button>
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
      </div>

      {/* Content based on view mode */}
      {viewMode === 'analysis' ? (
        <div>
          {/* Summary */}
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <TrendingUp className="h-6 w-6 text-green-600 mr-2" />
              <h3 className="text-xl font-semibold text-gray-900">Executive Summary</h3>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700 leading-relaxed">{results.summary}</p>
            </div>
          </div>

          {/* Key Takeaways */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Key Takeaways</h3>
            <div className="grid gap-3">
              {results.key_takeaways.map((takeaway, index) => (
                <div key={index} className="flex items-start">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                  <p className="text-gray-700">{takeaway}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 text-orange-600 mr-2" />
              <h3 className="text-xl font-semibold text-gray-900">Risk Assessment</h3>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">
              <p className="text-gray-700">{results.risk_assessment}</p>
            </div>
          </div>

          {/* Growth Analysis */}
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <Activity className="h-6 w-6 text-green-600 mr-2" />
              <h3 className="text-xl font-semibold text-gray-900">Growth Analysis</h3>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
              <p className="text-gray-700">{results.growth_analysis}</p>
            </div>
          </div>

          {/* Liquidity Analysis */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Liquidity Analysis</h3>
            <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">
              <p className="text-gray-700">{results.liquidity_analysis}</p>
            </div>
          </div>

          {/* Technical Details */}
          <div className="border-t border-gray-200 pt-4">
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
      ) : (
        <InteractiveFinancialStatements
          results={results}
          ticker={ticker}
          reportType={reportType}
          period={period}
        />
      )}
    </div>
  );
};

export default AnalysisResults; 