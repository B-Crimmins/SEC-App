import React, { useEffect, useState } from 'react';
import axios from 'axios';
import globalConfig from '../../../global/globalConfig.json';
import { formatCurrency as sharedFormatCurrency } from '../../../Utilities/formatters';
import { useUnits } from '../../../Utilities/UnitsContext';
import s from './statements.module.css';

const formatPercent = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
};

// Plain numeric input. Uses step/min/max natively and coerces the string value
// back to a number on change. Keeps the field usable when empty so the user
// can clear and retype without the field snapping to 0.
const NumberField = ({ label, description, value, onChange, step, min, max, prefix }) => (
  <div className={s.inputRoot}>
    <label className={s.inputLabel}>{label}</label>
    {description && <span className={s.inputDesc}>{description}</span>}
    <input
      className={s.input}
      type="number"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') { onChange(''); return; }
        const parsed = parseFloat(raw);
        onChange(Number.isNaN(parsed) ? '' : parsed);
      }}
      style={prefix ? { paddingLeft: 22 } : undefined}
    />
  </div>
);

const DCFAnalysis = ({ ticker, reportType, period }) => {
  const units = useUnits();
  const formatCurrency = (value) => sharedFormatCurrency(value, units);
  const [dcfData, setDcfData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inputs, setInputs] = useState({
    discountRate: 0.10,
    interimGrowthRate: 0.05,
    terminalGrowthRate: 0.03,
    forecastPeriods: 5,
    stockPrice: 0,
  });

  const fetchDCFData = async () => {
    if (!ticker || !reportType || !period) {
      setError('Enter a ticker, report type, and year in the sidebar first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(
        globalConfig.appUrl + '/api/analysis/dcf',
        {
          ticker,
          report_type: reportType,
          period,
          discount_rate: Number(inputs.discountRate) || 0,
          interim_growth_rate: Number(inputs.interimGrowthRate) || 0,
          terminal_growth_rate: Number(inputs.terminalGrowthRate) || 0,
          forecast_periods: Number(inputs.forecastPeriods) || 5,
          stock_price: Number(inputs.stockPrice) || 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessionStorage.getItem('token'),
          },
        }
      );
      setDcfData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to calculate DCF');
      setDcfData(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run when the sidebar-driven inputs change, but not on every keystroke
  // of the DCF-specific inputs — those require clicking Recalculate.
  useEffect(() => {
    if (ticker && reportType && period) {
      fetchDCFData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, reportType, period]);

  const set = (field, value) => setInputs((prev) => ({ ...prev, [field]: value }));

  return (
    <div className={s.stack} style={{ paddingTop: 16 }}>
      <h3 className={s.sectionLabel}>DCF Valuation</h3>
      <div className={s.dim}>
        {ticker
          ? `${ticker} · ${reportType || '—'} · ${period || '—'}`
          : 'Enter a ticker, report type, and year in the sidebar to run a valuation.'}
      </div>

      <div className={s.card}>
        <h4 className={s.cardTitle}>Valuation Parameters</h4>
        <div className={s.grid4}>
          <NumberField
            label="Discount Rate"
            description="As a decimal (e.g. 0.10 = 10%)"
            value={inputs.discountRate}
            onChange={(v) => set('discountRate', v)}
            step={0.01}
            min={0}
          />
          <NumberField
            label="Interim Growth Rate"
            description="Per-period growth during forecast"
            value={inputs.interimGrowthRate}
            onChange={(v) => set('interimGrowthRate', v)}
            step={0.01}
          />
          <NumberField
            label="Terminal Growth Rate"
            description="Must be below discount rate"
            value={inputs.terminalGrowthRate}
            onChange={(v) => set('terminalGrowthRate', v)}
            step={0.01}
          />
          <NumberField
            label="Forecast Periods"
            description="Years to project"
            value={inputs.forecastPeriods}
            onChange={(v) => set('forecastPeriods', v)}
            min={1}
            max={15}
            step={1}
          />
          <NumberField
            label="Stock Price"
            description="Current or target share price ($)"
            value={inputs.stockPrice}
            onChange={(v) => set('stockPrice', v)}
            min={0}
            step={1}
          />
        </div>
        <div className={s.rowEnd} style={{ marginTop: 12 }}>
          <button className={s.btn} type="button" onClick={fetchDCFData} disabled={loading}>
            {loading ? 'Calculating…' : 'Recalculate'}
          </button>
        </div>
      </div>

      {error && <div className={s.alertError}>{error}</div>}

      {loading && !dcfData && (
        <div className={s.grid2}>
          {[0, 1].map((i) => (
            <div key={i} className={s.card}>
              <div style={{ height: 14, width: '40%', background: 'var(--mantine-color-gray-2)', borderRadius: 4, marginBottom: 10 }} />
              <div className={s.stackSm}>
                {[0, 1, 2, 3, 4].map((j) => (
                  <div key={j} style={{ height: 12, background: 'var(--mantine-color-gray-2)', borderRadius: 4 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {dcfData && (
        <div className={s.grid2}>
          <div className={s.card}>
            <h4 className={s.cardTitle}>Assumptions</h4>
            <table className={s.table}>
              <tbody>
                <tr><td>Discount Rate</td><td className={s.num}>{formatPercent(dcfData.discount_rate)}</td></tr>
                <tr><td>Interim Growth Rate</td><td className={s.num}>{formatPercent(dcfData.interim_growth_rate)}</td></tr>
                <tr><td>Terminal Growth Rate</td><td className={s.num}>{formatPercent(dcfData.terminal_growth_rate)}</td></tr>
                <tr><td>Forecast Periods</td><td className={s.num}>{dcfData.forecast_periods}</td></tr>
                <tr><td>Latest Filing Year</td><td className={s.num}>{dcfData.latest_year}</td></tr>
              </tbody>
            </table>
          </div>

          <div className={s.card}>
            <h4 className={s.cardTitle}>Valuation Summary</h4>
            <table className={s.table}>
              <tbody>
                <tr><td>Terminal Value</td><td className={s.num}>{formatCurrency(dcfData.terminal_value)}</td></tr>
                <tr><td>Enterprise Value</td><td className={s.num}>{formatCurrency(dcfData.enterprise_value)}</td></tr>
                <tr><td>Equity Value</td><td className={s.num}>{formatCurrency(dcfData.equity_value)}</td></tr>
              </tbody>
            </table>
            <div className={s.popDivider} style={{ margin: '12px 0' }} />
            <div className={s.row}>
              <span style={{ fontWeight: 600 }}>Per Share Value</span>
              <span className={s.valuePositive}>{formatCurrency(dcfData.per_share_value)}</span>
            </div>
          </div>

          <div className={`${s.card} ${s.fullSpan}`}>
            <h4 className={s.cardTitle}>Projected Free Cash Flow</h4>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th className={s.numHead}>Projected FCF</th>
                  <th className={s.numHead}>Present Value</th>
                </tr>
              </thead>
              <tbody>
                {(dcfData.projected_fcf || []).map((fcf, idx) => (
                  <tr key={idx}>
                    <td>{dcfData.latest_year + idx + 1}</td>
                    <td className={s.num}>{formatCurrency(fcf)}</td>
                    <td className={s.num}>{formatCurrency(dcfData.present_values?.[idx])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DCFAnalysis;
