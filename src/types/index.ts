// User types
export interface User {
  id: number;
  email: string;
  username: string;
  tier: string;
  created_at: string;
}

// Authentication types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  username: string;
}

// Financial data types
export interface FinancialData {
  income_statement: Record<string, any>;
  balance_sheet: Record<string, any>;
  cash_flow: Record<string, any>;
}

export interface AnalysisResult {
  id: number;
  financial_report_id: number;
  user_id: number;
  summary: string;
  key_takeaways: string[];
  risk_assessment: string;
  growth_analysis: string;
  liquidity_analysis: string;
  statement_flow_explanations?: { [key: string]: string };
  openai_model_used: string;
  tokens_used: number;
  processing_time: number;
  created_at: string;
}

export interface TrendAnalysisResult {
  company_ticker: string;
  company_name: string;
  report_type: string;
  available_years: string[];
  trend_analysis: Record<string, any>;
  historical_data: Record<string, any>;
}

export interface HistoricalTrendsResult {
  company_ticker: string;
  company_name: string;
  report_type: string;
  available_years: string[];
  trend_analysis: any;
  historical_data: any;
  line_item_trends?: { [key: string]: string };
  executive_summary: string;
  revenue_trends: string;
  profitability_trends: string;
  balance_sheet_trends: string;
  cash_flow_trends: string;
  kpi_analysis: string;
  risk_assessment: string;
  future_outlook: string;
  openai_model_used: string;
  tokens_used: number;
  processing_time: number;
}

export interface PeerGroupData {
  [cik: string]: FinancialData;
}

// API response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: string;
}

// Form types
export interface AnalysisFormData {
  tickers: string[];
  analysis_type: 'single' | 'peer_group';
  date_range: string;
  report_type: string;
}

// Chart data types
export interface ChartDataPoint {
  name: string;
  value: number;
}

export interface TimeSeriesData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
  }[];
} 