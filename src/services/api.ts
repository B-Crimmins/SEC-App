import axios from 'axios';
import { 
  LoginCredentials, 
  RegisterCredentials, 
  User, 
  AnalysisResult, 
  HistoricalTrendsResult
} from '../types';

const API_BASE_URL = 'http://localhost:8000';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  login: async (credentials: LoginCredentials): Promise<{ access_token: string; user: User }> => {
    // Convert to form data for OAuth2PasswordRequestForm
    const formData = new URLSearchParams();
    formData.append('username', credentials.email);
    formData.append('password', credentials.password);
    
    const response = await api.post('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  register: async (credentials: RegisterCredentials): Promise<{ access_token: string; user: User }> => {
    const response = await api.post('/auth/register', credentials);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  getProfile: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// Financial Analysis API
export const analysisAPI = {
  getFinancialData: async (ticker: string, reportType: string, period: string) => {
    const response = await api.get(`/analysis/financial-data/${ticker}`, {
      params: { report_type: reportType, period }
    });
    return response.data;
  },

  getFinancialStatements: async (reportId: number) => {
    const response = await api.get(`/api/companies/financial-statements/${reportId}`);
    return response.data;
  },

  analyzeFinancialData: async (ticker: string, reportType: string, period: string): Promise<AnalysisResult> => {
    const response = await api.post('/api/analysis/generate', {
      ticker,
      report_type: reportType,
      period
    });
    return response.data;
  },

  getHistoricalTrends: async (ticker: string, reportType: string): Promise<HistoricalTrendsResult> => {
    const response = await api.get(`/analysis/historical-trends/${ticker}`, {
      params: { report_type: reportType }
    });
    return response.data;
  },

  getPeerGroupAnalysis: async (tickers: string[], reportType: string, periods: string[]): Promise<HistoricalTrendsResult> => {
    const response = await api.post('/api/analysis/peer-group-analysis', {
      tickers,
      report_type: reportType,
      periods
    });
    return response.data;
  },

  getMultiPeriodAnalysis: async (ticker: string, reportType: string, periods: string[]): Promise<HistoricalTrendsResult> => {
    const response = await api.post('/api/analysis/trend-analysis', {
      ticker,
      report_type: reportType,
      periods
    });
    return response.data;
  },

  exportFinancialStatements: async (reportId: number): Promise<void> => {
    const response = await api.get(`/api/export/${reportId}/csv`, {
      responseType: 'blob'
    });
    
    // Create download link
    const blob = new Blob([response.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial_report_${reportId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  getFinancialRatios: async (analysisId: number) => {
    const response = await api.get(`/api/analysis/${analysisId}/ratios`);
    return response.data;
  },
};

// SEC Data API
export const secAPI = {
  searchCompany: async (query: string) => {
    const response = await api.get('/sec/search', { params: { q: query } });
    return response.data;
  },

  getCompanyInfo: async (ticker: string) => {
    const response = await api.get(`/sec/company/${ticker}`);
    return response.data;
  },
};

export default api; 