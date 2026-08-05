import React, { useEffect, useState } from 'react';
import axios from 'axios';
import globalConfig from '../../../global/globalConfig.json';
import { formatCurrency as sharedFormatCurrency, formatPerShare } from '../../../Utilities/formatters';
import { useUnits } from '../../../Utilities/UnitsContext';
import { Slider } from '../../../src/components/ui/slider';
import s from './statements.module.css';
import { writeDcfResult } from '../../../src/lib/crossPortalStore';

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

// Slider for rate inputs. Values stored in state as decimals (0.10 = 10%) but
// the slider operates in percentage units so step/min/max read naturally.
const PercentSlider = ({ label, description, value, onChange, min, max, step }) => {
  const pct = typeof value === 'number' ? value * 100 : 0;
  return (
    <div className={s.inputRoot}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <label className={s.inputLabel}>{label}</label>
        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {pct.toFixed(2)}%
        </span>
      </div>
      {description && <span className={s.inputDesc}>{description}</span>}
      <div style={{ paddingTop: 10, paddingBottom: 4 }}>
        <Slider
          value={[pct]}
          onValueChange={([v]) => onChange(v / 100)}
          min={min}
          max={max}
          step={step}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.6 }}>
        <span>{min.toFixed(0)}%</span>
        <span>{max.toFixed(0)}%</span>
      </div>
    </div>
  );
};

const formatPctDecimal = (value, decimals = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
};

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
  const [waccInputs, setWaccInputs] = useState({
    beta: 1.0,
    riskFreeRate: 0.045,
    expectedMarketReturn: 0.10,
    costOfDebt: 0.05,
    costOfPreferred: 0.06,
  });
  const [waccData, setWaccData] = useState(null);
  const [waccLoading, setWaccLoading] = useState(false);
  const [waccError, setWaccError] = useState(null);

  const setWaccInput = (field, value) => setWaccInputs((prev) => ({ ...prev, [field]: value }));

  const fetchWACC = async () => {
    if (!ticker || !reportType || !period) {
      setWaccError('Enter a ticker, report type, and year in the sidebar first.');
      return;
    }
    if (!inputs.stockPrice) {
      setWaccError('Set a stock price below — WACC needs it to compute market cap.');
      return;
    }
    setWaccLoading(true);
    setWaccError(null);
    try {
      const response = await axios.post(
        globalConfig.appUrl + '/api/analysis/wacc',
        {
          ticker,
          report_type: reportType,
          period,
          beta: Number(waccInputs.beta) || 0,
          risk_free_rate: Number(waccInputs.riskFreeRate) || 0,
          expected_market_return: Number(waccInputs.expectedMarketReturn) || 0,
          stock_price: Number(inputs.stockPrice) || 0,
          cost_of_debt: Number(waccInputs.costOfDebt) || 0,
          cost_of_preferred: Number(waccInputs.costOfPreferred) || 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessionStorage.getItem('token'),
          },
        }
      );
      setWaccData(response.data);
    } catch (err) {
      setWaccError(err.response?.data?.detail || err.message || 'Failed to compute WACC');
      setWaccData(null);
    } finally {
      setWaccLoading(false);
    }
  };

  const useWaccAsDiscount = () => {
    if (waccData?.wacc !== null && waccData?.wacc !== undefined) {
      set('discountRate', waccData.wacc);
    }
  };

  // -------------------- Reverse DCF state --------------------
  const [reverseInputs, setReverseInputs] = useState({
    targetPrice: 0,
    solveFor: 'revenue_growth',
  });
  const [reverseData, setReverseData] = useState(null);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseError, setReverseError] = useState(null);

  const setReverseInput = (field, value) =>
    setReverseInputs((prev) => ({ ...prev, [field]: value }));

  const runReverseDCF = async () => {
    if (!ticker || !reportType || !period) {
      setReverseError('Enter a ticker, report type, and year in the sidebar first.');
      return;
    }
    if (!reverseInputs.targetPrice || reverseInputs.targetPrice <= 0) {
      setReverseError('Enter a target stock price to solve for.');
      return;
    }
    setReverseLoading(true);
    setReverseError(null);
    try {
      const r = await axios.post(
        globalConfig.appUrl + '/api/analysis/reverse-dcf',
        {
          ticker,
          report_type: reportType,
          period,
          target_price: Number(reverseInputs.targetPrice),
          solve_for: reverseInputs.solveFor,
          discount_rate: Number(inputs.discountRate) || 0,
          interim_growth_rate: Number(inputs.interimGrowthRate) || 0,
          terminal_growth_rate: Number(inputs.terminalGrowthRate) || 0,
          forecast_periods: Number(inputs.forecastPeriods) || 5,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessionStorage.getItem('token'),
          },
        }
      );
      setReverseData(r.data);
    } catch (err) {
      setReverseError(err.response?.data?.detail || err.message || 'Reverse DCF failed');
      setReverseData(null);
    } finally {
      setReverseLoading(false);
    }
  };

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
      // Mirror the result into sessionStorage so RelativeValuationPortal
      // can surface DCF intrinsic value alongside the peer-implied value.
      writeDcfResult(ticker, response.data);
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
      {!ticker && (
        <div className={s.dim}>
          Enter a ticker, report type, and year in the sidebar to run a valuation.
        </div>
      )}

      <div className={s.card}>
        <h4 className={s.cardTitle}>Cost of Capital (WACC)</h4>
        <div className={s.dim} style={{ marginBottom: 10 }}>
          CAPM cost of equity using your inputs, plus cost of debt derived from filings
          (interest expense ÷ long-term debt, tax-shielded by effective tax rate).
        </div>
        <div className={s.grid4}>
          <PercentSlider
            label="Nominal Risk-Free Rate"
            description="10-yr Treasury or comparable"
            value={waccInputs.riskFreeRate}
            onChange={(v) => setWaccInput('riskFreeRate', v)}
            min={0}
            max={10}
            step={0.05}
          />
          <PercentSlider
            label="Expected Market Return"
            description="Long-run equity-market return"
            value={waccInputs.expectedMarketReturn}
            onChange={(v) => setWaccInput('expectedMarketReturn', v)}
            min={0}
            max={20}
            step={0.1}
          />
          <div className={s.inputRoot}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <label className={s.inputLabel}>Beta</label>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {(typeof waccInputs.beta === 'number' ? waccInputs.beta : 0).toFixed(2)}
              </span>
            </div>
            <span className={s.inputDesc}>Equity beta (levered)</span>
            <div style={{ paddingTop: 10, paddingBottom: 4 }}>
              <Slider
                value={[typeof waccInputs.beta === 'number' ? waccInputs.beta : 0]}
                onValueChange={([v]) => setWaccInput('beta', v)}
                min={-1}
                max={3}
                step={0.01}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.6 }}>
              <span>-1.00</span>
              <span>3.00</span>
            </div>
          </div>
          <PercentSlider
            label="Cost of Debt"
            description="Pre-tax yield on debt"
            value={waccInputs.costOfDebt}
            onChange={(v) => setWaccInput('costOfDebt', v)}
            min={0}
            max={20}
            step={0.1}
          />
          <PercentSlider
            label="Cost of Preferred"
            description="Dp / Pp — set to 0% if no preferred"
            value={waccInputs.costOfPreferred}
            onChange={(v) => setWaccInput('costOfPreferred', v)}
            min={0}
            max={20}
            step={0.1}
          />
          <div className={s.inputRoot}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <label className={s.inputLabel}>After-Tax Cost of Debt</label>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'hsl(var(--accent))' }}>
                {waccData?.effective_tax_rate !== null && waccData?.effective_tax_rate !== undefined
                  ? formatPctDecimal(waccInputs.costOfDebt * (1 - waccData.effective_tax_rate))
                  : '—'}
              </span>
            </div>
            <span className={s.inputDesc}>
              {waccData?.effective_tax_rate !== null && waccData?.effective_tax_rate !== undefined
                ? `(1 − ${formatPctDecimal(waccData.effective_tax_rate, 1)}) × Cost of Debt`
                : 'Click Compute WACC — uses filings-derived effective tax rate'}
            </span>
            <div style={{ marginTop: 14, padding: '8px 10px', borderRadius: 6, background: 'hsl(var(--muted) / 0.4)', fontSize: 11, color: 'hsl(var(--muted-foreground))', lineHeight: 1.4 }}>
              Calculated. Tax rate pulled from filings:
              income taxes ÷ pretax income.
            </div>
          </div>
        </div>
        <div className={s.rowEnd} style={{ marginTop: 12, gap: 8 }}>
          {waccData?.wacc !== null && waccData?.wacc !== undefined && (
            <button
              className={s.btn}
              type="button"
              onClick={useWaccAsDiscount}
              style={{ background: 'transparent', color: 'hsl(var(--accent))', border: '1px solid hsl(var(--accent))' }}
            >
              Use as Discount Rate ({formatPctDecimal(waccData.wacc)})
            </button>
          )}
          <button className={s.btn} type="button" onClick={fetchWACC} disabled={waccLoading}>
            {waccLoading ? 'Computing…' : 'Compute WACC'}
          </button>
        </div>

        {waccError && <div className={s.alertError} style={{ marginTop: 10 }}>{waccError}</div>}

        {waccData && (
          <div style={{ marginTop: 12 }}>
            <div className={s.grid2}>
              <div>
                <h5 style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Capital Structure
                </h5>
                <table className={s.table}>
                  <tbody>
                    <tr><td>Market Cap (equity)</td><td className={s.num}>{formatCurrency(waccData.market_cap)}</td></tr>
                    <tr><td>Long-Term Debt</td><td className={s.num}>{formatCurrency(waccData.long_term_debt)}</td></tr>
                    <tr><td>Preferred Stock</td><td className={s.num}>{formatCurrency(waccData.preferred_stock)}</td></tr>
                    <tr><td>Total Capital</td><td className={s.num}>{formatCurrency(waccData.total_capital)}</td></tr>
                    <tr><td>Weight — Equity</td><td className={s.num}>{formatPctDecimal(waccData.weight_equity, 1)}</td></tr>
                    <tr><td>Weight — Debt</td><td className={s.num}>{formatPctDecimal(waccData.weight_debt, 1)}</td></tr>
                    <tr><td>Weight — Preferred</td><td className={s.num}>{formatPctDecimal(waccData.weight_preferred, 1)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h5 style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Cost Components
                </h5>
                <table className={s.table}>
                  <tbody>
                    <tr><td>Cost of Equity (CAPM)</td><td className={s.num}>{formatPctDecimal(waccData.cost_of_equity)}</td></tr>
                    <tr><td>Pre-tax Cost of Debt (input)</td><td className={s.num}>{formatPctDecimal(waccData.cost_of_debt)}</td></tr>
                    <tr><td>Effective Tax Rate (filings)</td><td className={s.num}>{formatPctDecimal(waccData.effective_tax_rate, 1)}</td></tr>
                    <tr><td>After-tax Cost of Debt</td><td className={s.num}>{formatPctDecimal(waccData.after_tax_cost_of_debt)}</td></tr>
                    <tr><td>Cost of Preferred (input)</td><td className={s.num}>{formatPctDecimal(waccData.cost_of_preferred)}</td></tr>
                    <tr style={{ borderTop: '1px solid hsl(var(--border))' }}>
                      <td style={{ fontWeight: 700 }}>WACC</td>
                      <td className={s.num} style={{ fontWeight: 700, color: 'hsl(var(--accent))' }}>
                        {formatPctDecimal(waccData.wacc)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {waccData.notes?.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                <strong>Notes:</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {waccData.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={s.card}>
        <h4 className={s.cardTitle}>Valuation Parameters</h4>
        <div className={s.grid4}>
          <PercentSlider
            label="Discount Rate"
            description="WACC or required return"
            value={inputs.discountRate}
            onChange={(v) => set('discountRate', v)}
            min={0}
            max={30}
            step={0.25}
          />
          <PercentSlider
            label="Interim Growth Rate"
            description="Per-period FCF growth during forecast"
            value={inputs.interimGrowthRate}
            onChange={(v) => set('interimGrowthRate', v)}
            min={-25}
            max={50}
            step={0.5}
          />
          <PercentSlider
            label="Terminal Growth Rate"
            description="Steady-state growth into perpetuity"
            value={inputs.terminalGrowthRate}
            onChange={(v) => set('terminalGrowthRate', v)}
            min={-5}
            max={15}
            step={0.25}
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
              <div style={{ height: 14, width: '40%', background: 'hsl(var(--muted))', borderRadius: 4, marginBottom: 10 }} />
              <div className={s.stackSm}>
                {[0, 1, 2, 3, 4].map((j) => (
                  <div key={j} style={{ height: 12, background: 'hsl(var(--muted))', borderRadius: 4 }} />
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
              <span className={s.valuePositive}>{formatPerShare(dcfData.per_share_value)}</span>
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
                {(dcfData.projected_fcf || []).map((fcf, idx, arr) => {
                  const isTerminal = idx === arr.length - 1;
                  return (
                    <tr
                      key={idx}
                      style={isTerminal ? { background: 'hsl(var(--accent) / 0.08)', fontWeight: 600 } : undefined}
                    >
                      <td>
                        {isTerminal
                          ? `Terminal Value (yr ${dcfData.latest_year + idx})`
                          : dcfData.latest_year + idx + 1}
                      </td>
                      <td className={s.num}>{formatCurrency(fcf)}</td>
                      <td className={s.num}>{formatCurrency(dcfData.present_values?.[idx])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------- Reverse DCF (bottom) ------------------- */}
      <div className={s.card}>
        <h4 className={s.cardTitle}>Reverse DCF — Market-Implied Assumptions</h4>
        <div className={s.dim} style={{ marginBottom: 10 }}>
          Given the current market price, solve for the single assumption that justifies it
          while the other three are held at the values from the Valuation Parameters above.
          Uses Brent's method (scipy.optimize.brentq).
        </div>
        <div className={s.grid4}>
          <div className={s.inputRoot}>
            <label className={s.inputLabel}>Current Stock Price ($)</label>
            <span className={s.inputDesc}>Target price the DCF must reproduce</span>
            <input
              className={s.input}
              type="number"
              value={reverseInputs.targetPrice}
              step={0.5}
              min={0}
              onChange={(e) => {
                const v = e.target.value;
                setReverseInput('targetPrice', v === '' ? '' : parseFloat(v));
              }}
            />
          </div>
          <div className={s.inputRoot} style={{ gridColumn: 'span 2' }}>
            <label className={s.inputLabel}>Solve for</label>
            <span className={s.inputDesc}>Pick one variable; others stay at current settings</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
              {[
                { key: 'revenue_growth',   label: 'Revenue growth' },
                { key: 'operating_margin', label: 'Operating margin' },
                { key: 'wacc',             label: 'WACC' },
                { key: 'terminal_growth',  label: 'Terminal growth' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setReverseInput('solveFor', opt.key)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: '1px solid hsl(var(--border))',
                    background: reverseInputs.solveFor === opt.key
                      ? 'hsl(var(--accent))'
                      : 'transparent',
                    color: reverseInputs.solveFor === opt.key
                      ? 'hsl(var(--accent-foreground))'
                      : 'hsl(var(--foreground))',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              className={s.btn}
              type="button"
              onClick={runReverseDCF}
              disabled={reverseLoading}
              style={{ width: '100%' }}
            >
              {reverseLoading ? 'Solving…' : 'Solve'}
            </button>
          </div>
        </div>

        {reverseError && <div className={s.alertError} style={{ marginTop: 10 }}>{reverseError}</div>}

        {reverseData && !reverseData.converged && (
          <div className={s.alertError} style={{ marginTop: 12 }}>
            Solver did not converge. {reverseData.notes?.[reverseData.notes.length - 1]}
          </div>
        )}

        {reverseData && reverseData.converged && (() => {
          // Map solve_for to a label + a key in held_constant. The
          // backend now omits the solved key from held_constant, so we
          // pull the value from implied_value instead.
          const SOLVE_META = {
            revenue_growth:   { label: 'Revenue Growth (interim)', constantKey: 'interim_growth_rate' },
            operating_margin: { label: 'Operating Margin (FCF proxy)', constantKey: null },
            wacc:             { label: 'WACC',                     constantKey: 'discount_rate' },
            terminal_growth:  { label: 'Terminal Growth',          constantKey: 'terminal_growth_rate' },
          };
          const meta = SOLVE_META[reverseData.solve_for] || { label: reverseData.solve_for, constantKey: null };
          const held = reverseData.held_constant || {};

          // Per-row data. `forwardValue` is what the user set in the
          // Valuation Parameters card (or the operating-margin proxy
          // which we don't surface forward — left blank). `reverseValue`
          // is the held-constant value, EXCEPT for the row matching the
          // solve target, where we use implied_value and flag it.
          const rows = [
            {
              key: 'wacc',
              label: 'WACC (discount rate)',
              forwardValue: inputs.discountRate,
              isSolved: reverseData.solve_for === 'wacc',
              reverseValue: reverseData.solve_for === 'wacc'
                ? reverseData.implied_value
                : held.discount_rate,
            },
            {
              key: 'revenue_growth',
              label: 'Revenue growth (interim, per period)',
              forwardValue: inputs.interimGrowthRate,
              isSolved: reverseData.solve_for === 'revenue_growth',
              reverseValue: reverseData.solve_for === 'revenue_growth'
                ? reverseData.implied_value
                : held.interim_growth_rate,
            },
            {
              key: 'terminal_growth',
              label: 'Terminal growth',
              forwardValue: inputs.terminalGrowthRate,
              isSolved: reverseData.solve_for === 'terminal_growth',
              reverseValue: reverseData.solve_for === 'terminal_growth'
                ? reverseData.implied_value
                : held.terminal_growth_rate,
            },
            {
              key: 'operating_margin',
              label: 'Operating margin (FCF / Revenue proxy)',
              forwardValue: null,
              isSolved: reverseData.solve_for === 'operating_margin',
              reverseValue: reverseData.solve_for === 'operating_margin'
                ? reverseData.implied_value
                : null,
            },
          ];

          const cellFmt = (v) =>
            v === null || v === undefined ? <span style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>—</span>
                                          : formatPctDecimal(v);

          return (
            <div style={{ marginTop: 14 }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: 'hsl(var(--accent) / 0.10)',
                border: '1px solid hsl(var(--accent) / 0.35)',
                marginBottom: 12,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Market-Implied {meta.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'hsl(var(--accent))', fontVariantNumeric: 'tabular-nums' }}>
                  {(reverseData.implied_value * 100).toFixed(2)}%
                </div>
                <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                  Solves the DCF to ${reverseData.dcf_price_at_solution?.toFixed(2)} (target ${reverseData.target_price.toFixed(2)})
                </div>
              </div>

              {/* Side-by-side comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <h5 style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Forward DCF — your assumptions
                  </h5>
                  <table className={s.table}>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key}>
                          <td>{r.label}</td>
                          <td className={s.num}>{cellFmt(r.forwardValue)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px solid hsl(var(--border))' }}>
                        <td style={{ fontWeight: 600 }}>Per Share Value</td>
                        <td className={s.num} style={{ fontWeight: 600 }}>
                          {dcfData?.per_share_value !== null && dcfData?.per_share_value !== undefined
                            ? formatPerShare(dcfData.per_share_value)
                            : <span style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>—</span>}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <h5 style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Reverse DCF — market-implied
                  </h5>
                  <table className={s.table}>
                    <tbody>
                      {rows.map((r) => (
                        <tr
                          key={r.key}
                          style={r.isSolved ? { background: 'hsl(var(--accent) / 0.10)' } : undefined}
                        >
                          <td style={r.isSolved ? { fontWeight: 600 } : undefined}>
                            {r.label}
                            {r.isSolved && (
                              <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))', verticalAlign: 'middle' }}>
                                solved
                              </span>
                            )}
                          </td>
                          <td className={s.num} style={r.isSolved ? { fontWeight: 700, color: 'hsl(var(--accent))' } : undefined}>
                            {cellFmt(r.reverseValue)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px solid hsl(var(--border))' }}>
                        <td style={{ fontWeight: 600 }}>Per Share Value (target)</td>
                        <td className={s.num} style={{ fontWeight: 600 }}>
                          {formatPerShare(reverseData.target_price)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {reverseData.notes?.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                  <strong>Notes:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {reverseData.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default DCFAnalysis;
