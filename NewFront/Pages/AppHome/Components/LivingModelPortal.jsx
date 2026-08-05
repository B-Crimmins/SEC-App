import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconChartHistogram,
  IconCoin,
  IconRefresh,
  IconSparkles,
} from '@tabler/icons-react';
import globalConfig from '../../../global/globalConfig.json';
import {
  extractHistory,
  extractDrivers,
  projectModel,
} from '../../../src/lib/projection';
import { runDcf } from '../../../src/lib/projectionDcf';
import { lookup } from '../../../src/lib/canonicalLineItems';
import { formatCurrency, formatPerShare } from '../../../Utilities/formatters';
import { UnitsContext } from '../../../Utilities/UnitsContext';
import { Card } from '../../../src/components/ui/card';
import { Badge } from '../../../src/components/ui/badge';
import { Button } from '../../../src/components/ui/button';
import { Slider } from '../../../src/components/ui/slider';
import { cn } from '../../../src/lib/utils';
import DriverInput from './DriverInput';
import TornadoChart from './TornadoChart';
import PortalSearchBar from '../../../src/components/PortalSearchBar';
import { writeDrivers } from '../../../src/lib/crossPortalStore';

// ---------------------------------------------------------------------------
// Driver-rail config — drives the layout of the left rail.
// `step`/`min`/`max` are in DISPLAY units (% or days), not the stored decimals.
// ---------------------------------------------------------------------------
const DRIVER_DEFS = [
  { key: 'revenueGrowth',  label: 'Revenue growth',     format: 'percent', min: -25, max: 50, step: 0.5, description: 'Year-over-year revenue growth applied to each forecast year' },
  { key: 'grossMargin',    label: 'Gross margin',       format: 'percent', min: 0,   max: 95, step: 0.5, description: 'Gross profit ÷ revenue' },
  { key: 'opexPct',        label: 'Operating expenses', format: 'percent', min: 0,   max: 90, step: 0.5, description: 'Opex ÷ revenue (excl. D&A)' },
  { key: 'dso',            label: 'DSO',                format: 'days',    min: 0,   max: 365, step: 1, description: 'Days sales outstanding → drives receivables' },
  { key: 'dio',            label: 'DIO',                format: 'days',    min: 0,   max: 365, step: 1, description: 'Days inventory outstanding → drives inventory' },
  { key: 'dpo',            label: 'DPO',                format: 'days',    min: 0,   max: 365, step: 1, description: 'Days payable outstanding → drives payables' },
  { key: 'capexPct',       label: 'CapEx % revenue',    format: 'percent', min: 0,   max: 30, step: 0.25, description: 'Capital expenditures ÷ revenue' },
  { key: 'daPct',          label: 'D&A % revenue',      format: 'percent', min: 0,   max: 20, step: 0.25, description: 'Depreciation & amortization ÷ revenue' },
  { key: 'taxRate',        label: 'Tax rate',           format: 'percent', min: 0,   max: 50, step: 0.5, description: 'Effective tax rate on pretax income' },
];

// DCF assumptions for the projection — separate from the driver rail because
// they live in capital-markets land, not operating-driver land.
const DEFAULT_WACC = 0.10;
const DEFAULT_TERMINAL_GROWTH = 0.03;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtPctDecimal = (v, dp = 2) =>
  v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(dp)}%`;

const numericDiff = (a, b) => (a == null || b == null ? null : a - b);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const LivingModelPortal = () => {
  // ---- Own search state — separated from the Fundamentals portal so the
  // user can have different tickers / periods loaded in each. ----
  const [tickers, setTickers] = useState([]);
  const [reportType, setReportType] = useState('10-K');
  const [years, setYears] = useState([]);
  const [units, setUnits] = useState('M');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const authHeader = () => ({
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + sessionStorage.getItem('token'),
  });

  const handleSearch = (yearList = years) => {
    const tickerList = tickers.filter((t) => t && t.trim() !== '');
    if (tickerList.length === 0) { alert('Add at least one ticker'); return; }
    if (yearList.length === 0) { alert('Add at least one period — load 3+ years for best baseline drivers'); return; }
    if (!reportType) { alert('Pick a report type'); return; }
    setLoading(true);
    axios
      .post(
        globalConfig.appUrl + '/api/analysis/test-this',
        { ticker: tickerList, periods: yearList, report_type: reportType },
        { headers: authHeader() }
      )
      .then((r) => setData(r.data))
      .catch((e) => alert('Error: ' + (e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  };

  // ---- Ticker chip strip ----
  const companies = data?.companies || [];
  const [activeCik, setActiveCik] = useState(null);
  const cikKey = companies.map((c) => c?.company?.cik).join('|');
  useEffect(() => {
    setActiveCik(companies[0]?.company?.cik || null);
  }, [cikKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const company =
    companies.find((c) => c?.company?.cik === activeCik) ||
    companies[0] ||
    null;

  // ---- Pull history + seed drivers ----
  const history = useMemo(
    () => (company ? extractHistory(company.statements, company.years || []) : null),
    [company]
  );
  const { drivers: seedDrivers, baselines } = useMemo(
    () => (history ? extractDrivers(history) : { drivers: {}, baselines: {} }),
    [history]
  );

  // ---- Editable driver state. Reset when ticker changes. ----
  const [drivers, setDrivers] = useState({});
  useEffect(() => {
    setDrivers(seedDrivers);
  }, [seedDrivers]);

  // Mirror drivers + active ticker into sessionStorage so RelativeValuationPortal
  // can read the user's tuned assumptions for the implied-driver cross-check.
  useEffect(() => {
    const tk = company?.company?.ticker;
    if (!tk || !drivers || Object.keys(drivers).length === 0) return;
    writeDrivers(tk, drivers);
  }, [drivers, company]);

  // ---- DCF assumption state ----
  const [wacc, setWacc] = useState(DEFAULT_WACC);
  const [terminalGrowth, setTerminalGrowth] = useState(DEFAULT_TERMINAL_GROWTH);

  // Capital structure pulled from the latest historical period (for the
  // equity-bridge in the DCF).
  const capStructure = useMemo(() => {
    if (!history || history.years.length === 0) return { totalDebt: 0, cash: 0, sharesOutstanding: 0 };
    const last = history.years.length - 1;
    // Shares outstanding doesn't live in the canonical line-item set (it's
    // a per-share concept), so pull directly from the categorized blob.
    const shares =
      lookup(company.statements, 'income_statement', 'is-revenue', history.years[last]) != null
        ? (() => {
            // Try a few common label variants for shares outstanding.
            const stmt = company.statements?.balance_sheet || {};
            for (const cat of Object.keys(stmt)) {
              for (const item of stmt[cat]) {
                const t = (item.type || '').toLowerCase();
                if (
                  t.includes('shares outstanding') ||
                  t.includes('shares issued') ||
                  t.includes('common stock, shares')
                ) {
                  const v = item.values?.[history.years[last]];
                  if (typeof v === 'number' && v > 0) return v;
                }
              }
            }
            // Fall back to income-statement weighted-average diluted.
            const is = company.statements?.income_statement || {};
            for (const cat of Object.keys(is)) {
              for (const item of is[cat]) {
                const t = (item.type || '').toLowerCase();
                if (t.includes('shares') && (t.includes('diluted') || t.includes('basic'))) {
                  const v = item.values?.[history.years[last]];
                  if (typeof v === 'number' && v > 0) return v;
                }
              }
            }
            return 0;
          })()
        : 0;
    return {
      totalDebt: history.debt[last] ?? 0,
      cash: history.cash[last] ?? 0,
      sharesOutstanding: shares,
    };
  }, [company, history]);

  // ---- Run the projection ----
  const result = useMemo(
    () => (history ? projectModel(history, drivers, 5) : null),
    [history, drivers]
  );
  const baseResult = useMemo(
    () => (history ? projectModel(history, seedDrivers, 5) : null),
    [history, seedDrivers]
  );
  const dcf = useMemo(
    () => (result ? runDcf(result.fcfSeries, wacc, terminalGrowth, capStructure) : null),
    [result, wacc, terminalGrowth, capStructure]
  );
  const baseDcf = useMemo(
    () => (baseResult ? runDcf(baseResult.fcfSeries, wacc, terminalGrowth, capStructure) : null),
    [baseResult, wacc, terminalGrowth, capStructure]
  );

  // ---- Driver-change detection (for highlighting + reset button) ----
  const changedKeys = useMemo(() => {
    const out = new Set();
    DRIVER_DEFS.forEach((d) => {
      if (
        drivers[d.key] != null &&
        seedDrivers[d.key] != null &&
        Math.abs(drivers[d.key] - seedDrivers[d.key]) > 1e-9
      ) {
        out.add(d.key);
      }
    });
    return out;
  }, [drivers, seedDrivers]);

  const resetAllDrivers = () => setDrivers(seedDrivers);

  // ---- Working-capital + sensitivity callouts ----
  const callouts = useMemo(() => {
    if (!result || !baseResult) return [];
    const out = [];
    // WC tied-up callouts — compare year-1 cumulative WC investment of
    // current vs base case. We surface the largest of (AR, Inv, AP) deltas.
    const r = result.projected;
    const b = baseResult.projected;

    const compare = (label, mechanism, idx, currentAR, baseAR, sign = -1) => {
      const cur = currentAR;
      const base = baseAR;
      if (cur == null || base == null) return;
      const diff = (cur - base) * sign; // sign: cash impact direction
      if (Math.abs(diff) < 1e6) return;
      const dPerShare = dcf && baseDcf ? dcf.perShareValue - baseDcf.perShareValue : null;
      const tied = diff < 0;
      out.push({
        kind: tied ? 'tied' : 'released',
        text: tied
          ? `${mechanism} tied up ${formatCurrency(Math.abs(diff), units)} in year-1 working capital.`
          : `${mechanism} released ${formatCurrency(Math.abs(diff), units)} of working capital in year 1.`,
        dcfImpact: dPerShare,
      });
    };

    // Year-1 deltas in AR / Inv / AP between current and base.
    if (changedKeys.has('dso'))
      compare('AR', 'Slower collections (higher DSO)', 0, r.delta_ar[0], b.delta_ar[0], -1);
    if (changedKeys.has('dio'))
      compare('Inventory', 'Higher inventory days (DIO)', 0, r.delta_inv[0], b.delta_inv[0], -1);
    if (changedKeys.has('dpo'))
      compare('AP', 'Stretching payables (higher DPO)', 0, r.delta_ap[0], b.delta_ap[0], +1);

    return out;
  }, [result, baseResult, changedKeys, dcf, baseDcf, units]);

  // ---- Render ----
  // Shell wraps every render path with the search bar so the user can run
  // / re-run a query from inside the portal without leaving it.
  const Shell = ({ children }) => (
    <UnitsContext.Provider value={units}>
      <div className="flex flex-col h-full overflow-hidden">
        <PortalSearchBar
          title="Model"
          tickers={tickers} onTickersChange={setTickers}
          reportType={reportType} onReportTypeChange={setReportType}
          years={years} onYearsChange={setYears}
          units={units} onUnitsChange={setUnits}
          loading={loading}
          onSearch={handleSearch}
          hint="Load 3+ historical periods so the driver baselines (DSO, gross margin, CapEx %, …) average over a real trailing window."
        />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </UnitsContext.Provider>
  );

  if (!company || !history || history.years.length === 0) {
    return (
      <Shell>
        <div className="p-6 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <IconChartHistogram size={28} className="text-accent" />
            <h2 className="text-2xl font-semibold">Living Model</h2>
          </div>
          <Card className="p-5">
            <p className="text-muted-foreground text-sm">
              Enter a ticker, report type, and 3+ historical periods in the bar above, then click
              <strong> Search</strong>. The Living Model needs at least 2 years to compute driver
              baselines — 3+ gives much better averages for DSO, gross margin, CapEx %, etc.
            </p>
          </Card>
        </div>
      </Shell>
    );
  }

  if (history.years.length < 2) {
    return (
      <Shell>
        <div className="p-6 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <IconChartHistogram size={28} className="text-accent" />
            <h2 className="text-2xl font-semibold">Living Model</h2>
          </div>
          <Card className="p-5">
            <p className="text-muted-foreground text-sm">
              Only one historical period loaded. The Living Model needs at least 2 years to compute
              YoY growth and trailing-average drivers. Add more periods in the bar above and click
              <strong> Search</strong>.
            </p>
          </Card>
        </div>
      </Shell>
    );
  }

  const horizon = 5;
  const allYears = [...history.years, ...result.projYears];

  // Renders a single row in the side-by-side statements table.
  const renderRow = (label, histArr, projArr, opts = {}) => {
    const { bold, format = 'currency', signFlip = false, indent = false } = opts;
    const cell = (v, isForecast) => {
      const display = v == null
        ? '—'
        : format === 'percent'
          ? `${(v * 100).toFixed(1)}%`
          : formatCurrency(signFlip ? (v == null ? null : -v) : v, units);
      return (
        <td
          className={cn(
            'px-3 py-1.5 text-right tabular-nums whitespace-nowrap',
            bold && 'font-semibold',
            isForecast ? 'bg-accent/[0.04]' : ''
          )}
        >
          {display}
        </td>
      );
    };
    return (
      <tr key={label} className={cn(bold && 'font-semibold')}>
        <td className={cn('px-3 py-1.5 text-foreground', indent && 'pl-6 text-muted-foreground')}>{label}</td>
        {history.years.map((yr, i) => cell(histArr[i], false))}
        <td className="w-px bg-border p-0" />
        {result.projYears.map((yr, i) => cell(projArr[i], true))}
      </tr>
    );
  };

  const tabularHeader = () => (
    <thead>
      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
        <th className="px-3 py-2 text-left font-semibold">Line item</th>
        {history.years.map((yr) => (
          <th key={yr} className="px-3 py-2 text-right font-semibold">{yr}</th>
        ))}
        <th className="w-px bg-border p-0" />
        {result.projYears.map((yr) => (
          <th
            key={yr}
            className="px-3 py-2 text-right font-semibold bg-accent/[0.07] text-accent"
          >
            {yr.replace(/^F/, '')}
            <span className="ml-1 inline-block px-1 rounded text-[8px] uppercase bg-accent text-accent-foreground tracking-wider">
              forecast
            </span>
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <Shell>
    <div className="px-4 py-4 max-w-[1600px] mx-auto">
      {/* ============= Header ============= */}
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <IconChartHistogram size={28} className="text-accent" />
          <h2 className="text-2xl font-semibold">Living Model</h2>
          <span className="text-sm text-muted-foreground">
            · {company?.company?.ticker || company?.company?.name} · Historical {history.years[0]}–{history.years[history.years.length - 1]} · Forecast {result.projYears[0].replace(/^F/, '')}–{result.projYears[result.projYears.length - 1].replace(/^F/, '')}
          </span>
          {companies.length > 1 && (
            <div className="flex items-center gap-1.5 ml-1">
              {companies.map((c) => {
                const cik = c?.company?.cik;
                const tk = c?.company?.ticker || c?.company?.cik;
                const isActive = cik === company?.company?.cik;
                return (
                  <button
                    key={cik}
                    type="button"
                    onClick={() => setActiveCik(cik)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-semibold transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-card-hover/40 text-muted-foreground hover:bg-card-hover hover:text-foreground'
                    )}
                  >
                    {tk}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {changedKeys.size > 0 && (
          <Button variant="outline" size="sm" onClick={resetAllDrivers}>
            <IconRefresh size={14} /> Reset all to baseline
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4 max-w-4xl">
        Historical numbers are <strong>reported and locked</strong>. Edit the operating drivers on the left to
        generate a forecast — every change recomputes the projected statements and flows through to the DCF.
        Interest is held constant via <span className="font-mono text-[11px]">debt × historical rate</span> so
        operating decisions stay separable from capital-structure ones.
      </p>

      {/* ============= Body: driver rail + main canvas ============= */}
      <div className="grid grid-cols-[320px_1fr] gap-4 items-start">
        {/* ----- Driver rail ----- */}
        <div className="space-y-3 sticky top-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
            Operating drivers
          </div>
          {DRIVER_DEFS.map((def) => {
            const baseline = seedDrivers[def.key];
            const series = baselines[def.key]?.values || [];
            return (
              <DriverInput
                key={def.key}
                label={def.label}
                description={def.description}
                format={def.format}
                min={def.min}
                max={def.max}
                step={def.step}
                value={drivers[def.key] ?? baseline ?? 0}
                onChange={(v) => setDrivers((prev) => ({ ...prev, [def.key]: v }))}
                baseline={baseline}
                baselineLabel={`${history.years.length}-yr avg`}
                series={series}
                changed={changedKeys.has(def.key)}
              />
            );
          })}

        </div>

        {/* ----- Main canvas ----- */}
        <div className="space-y-4 min-w-0">
          {/* DCF summary — WACC + terminal growth sliders live here so the
              user can see directly that these two assumptions drive the
              headline per-share value. */}
          <Card className="p-5">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  Per Share Value
                </div>
                <div className="text-4xl font-bold tabular-nums text-accent leading-tight">
                  {dcf ? formatPerShare(dcf.perShareValue) : '—'}
                </div>
                {baseDcf && dcf && Math.abs(dcf.perShareValue - baseDcf.perShareValue) > 0.01 && (
                  <div className={cn(
                    'text-xs mt-1 tabular-nums',
                    dcf.perShareValue >= baseDcf.perShareValue ? 'text-gain' : 'text-loss'
                  )}>
                    {dcf.perShareValue >= baseDcf.perShareValue ? '+' : ''}
                    {formatPerShare(dcf.perShareValue - baseDcf.perShareValue)} vs baseline ({formatPerShare(baseDcf.perShareValue)})
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-2">
                  EV {dcf ? formatCurrency(dcf.enterpriseValue, units) : '—'} = Σ PV(forecast FCF) + PV(terminal)
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">WACC</span>
                  <span className="text-sm font-semibold text-accent tabular-nums">{(wacc * 100).toFixed(2)}%</span>
                </div>
                <Slider value={[wacc * 100]} onValueChange={([v]) => setWacc(v / 100)} min={1} max={25} step={0.25} className="mt-1" />
                <div className="text-[10px] text-muted-foreground mt-1.5">
                  Discount rate applied to every projected FCF and the terminal value.
                </div>

                <div className="flex items-baseline justify-between mb-1 mt-4">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Terminal growth</span>
                  <span className="text-sm font-semibold text-accent tabular-nums">{(terminalGrowth * 100).toFixed(2)}%</span>
                </div>
                <Slider value={[terminalGrowth * 100]} onValueChange={([v]) => setTerminalGrowth(v / 100)} min={-2} max={10} step={0.25} className="mt-1" />
                <div className="text-[10px] text-muted-foreground mt-1.5">
                  Perpetuity growth past year 5. Must stay below WACC for Gordon growth to converge.
                </div>
              </div>

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  Capital Structure (latest historical)
                </div>
                <div className="text-xs space-y-0.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Debt</span><span className="tabular-nums">{formatCurrency(capStructure.totalDebt, units)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cash</span><span className="tabular-nums">{formatCurrency(capStructure.cash, units)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Shares (mm)</span><span className="tabular-nums">{(capStructure.sharesOutstanding / 1e6).toFixed(1)}</span></div>
                </div>
              </div>
            </div>
          </Card>

          {/* Teaching callouts */}
          {callouts.length > 0 && (
            <div className="space-y-2">
              {callouts.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-md border text-sm',
                    c.kind === 'tied'
                      ? 'border-loss/30 bg-loss/5 text-foreground'
                      : 'border-gain/30 bg-gain/5 text-foreground'
                  )}
                >
                  <IconCoin size={16} className={c.kind === 'tied' ? 'text-loss mt-0.5' : 'text-gain mt-0.5'} />
                  <div>
                    {c.text}
                    {c.dcfImpact != null && Math.abs(c.dcfImpact) > 0.01 && (
                      <span className="text-muted-foreground ml-1">
                        Per-share value moved {c.dcfImpact >= 0 ? '+' : ''}{formatPerShare(c.dcfImpact)} vs baseline.
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Warnings (financing gap, balance drift) */}
          {result.warnings.length > 0 && (
            <div className="space-y-2">
              {result.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-md border border-loss/40 bg-loss/10 text-sm text-foreground"
                >
                  <IconAlertTriangle size={16} className="text-loss mt-0.5 shrink-0" />
                  <div>{w}</div>
                </div>
              ))}
            </div>
          )}

          {/* Side-by-side statements */}
          {[
            {
              title: 'Income Statement',
              rows: [
                { label: 'Revenue',           hist: history.revenue,           proj: result.projected.revenue, bold: true },
                { label: 'Cost of revenue',   hist: history.cogs,              proj: result.projected.cogs,    indent: true },
                { label: 'Gross profit',      hist: history.gross_profit,      proj: result.projected.gross_profit, bold: true },
                { label: 'Operating expenses',hist: history.operating_expense_derived, proj: result.projected.operating_expense, indent: true },
                { label: 'Depreciation & amortization', hist: history.da,      proj: result.projected.da,      indent: true },
                { label: 'Operating income',  hist: history.operating_income,  proj: result.projected.ebit,    bold: true },
                { label: 'Interest expense',  hist: history.interest_expense.map((v) => v == null ? null : Math.abs(v)), proj: result.projected.interest,  indent: true },
                { label: 'Income tax expense',hist: history.tax_expense,       proj: result.projected.tax,     indent: true },
                { label: 'Net income',        hist: history.net_income,        proj: result.projected.net_income, bold: true },
              ],
            },
            {
              title: 'Balance Sheet',
              rows: [
                { label: 'Cash & equivalents',hist: history.cash,              proj: result.projected.cash },
                { label: 'Accounts receivable', hist: history.ar,              proj: result.projected.ar },
                { label: 'Inventory',         hist: history.inventory,         proj: result.projected.inventory },
                { label: 'PP&E, net',         hist: history.ppe,               proj: result.projected.ppe },
                { label: 'Other assets (non-operating, % of rev)', hist: history.other_assets, proj: result.projected.other_assets, indent: true },
                { label: 'Total assets',      hist: history.total_assets,      proj: result.projected.total_assets, bold: true },
                { label: 'Accounts payable',  hist: history.ap,                proj: result.projected.ap },
                { label: 'Long-term debt',    hist: history.debt,              proj: result.projected.debt },
                { label: 'Other liabilities (% of rev)',           hist: history.other_liab,   proj: result.projected.other_liab,   indent: true },
                { label: 'Total liabilities', hist: history.total_liab_derived, proj: result.projected.total_liab, bold: true },
                { label: 'Common stock + APIC', hist: history.common_stock,    proj: result.projected.common_stock },
                { label: 'Retained earnings', hist: history.retained_earnings, proj: result.projected.retained_earnings },
                { label: 'Other equity (AOCI / treasury / plug)',  hist: history.other_equity, proj: result.projected.other_equity, indent: true },
                { label: 'Total equity',      hist: history.total_equity,      proj: result.projected.total_equity, bold: true },
              ],
            },
            {
              title: 'Cash Flow',
              rows: [
                { label: 'Net income',                hist: history.net_income,                            proj: result.projected.net_income },
                { label: 'Depreciation & amort.',     hist: history.da,                                    proj: result.projected.da,             indent: true },
                // Δ working-capital lines render as signed CASH IMPACT — positive = cash
                // released, negative = cash tied up. Historical numbers from the CF
                // statement are already in this convention; projected BS deltas need
                // their sign flipped (a +$355M AR build is a −$355M cash impact).
                { label: 'Δ Accounts receivable',     hist: history.cf_delta_ar,                           proj: result.projected.delta_ar.map((v)  => (v == null ? null : -v)), indent: true },
                { label: 'Δ Inventory',               hist: history.cf_delta_inv,                          proj: result.projected.delta_inv.map((v) => (v == null ? null : -v)), indent: true },
                { label: 'Δ Accounts payable',        hist: history.cf_delta_ap,                           proj: result.projected.delta_ap,       indent: true },
                { label: 'Cash from operations',      hist: history.cf_operating,                          proj: result.projected.cf_operating,   bold: true },
                { label: 'CapEx',                     hist: history.capex.map((v) => (v == null ? null : -v)), proj: result.projected.capex.map((v) => (v == null ? null : -v)), indent: true },
                { label: 'Cash from investing',       hist: history.cf_investing,                          proj: result.projected.cf_investing,   bold: true },
                { label: 'Dividends paid',            hist: history.dividends.map((v) => (v == null ? null : -v)), proj: result.projected.dividends.map((v) => (v == null ? null : -v)), indent: true },
                { label: 'Cash from financing',       hist: history.cf_financing,                          proj: result.projected.cf_financing,   bold: true },
                { label: 'Net change in cash',        hist: history.cf_net_change,                         proj: result.projected.delta_cash,     bold: true },
              ],
            },
          ].map((stmt) => (
            <Card key={stmt.title} className="p-0 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-card-hover/30 flex items-center justify-between">
                <h4 className="text-sm font-semibold">{stmt.title}</h4>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-foreground/30" /> Reported
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-accent" /> Forecast
                  </span>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  {tabularHeader()}
                  <tbody>
                    {stmt.rows.map((r) =>
                      renderRow(r.label, r.hist, r.proj, { bold: r.bold, indent: r.indent })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {/* Sensitivity */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <IconSparkles size={16} className="text-accent" />
              <h4 className="text-sm font-semibold">Sensitivity — which drivers move the DCF most?</h4>
            </div>
            <TornadoChart
              history={history}
              drivers={drivers}
              horizon={horizon}
              wacc={wacc}
              terminalGrowth={terminalGrowth}
              capStructure={capStructure}
            />
          </Card>

          {/* Balance check */}
          <Card className="p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Balance sheet check
            </h4>
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Year</th>
                  <th className="text-right py-1">Total Assets</th>
                  <th className="text-right py-1">Liab + Equity</th>
                  <th className="text-right py-1">Variance</th>
                  <th className="text-right py-1">Variance %</th>
                </tr>
              </thead>
              <tbody>
                {result.balanceCheck.map((b) => (
                  <tr key={b.year} className="border-t border-border/40">
                    <td className="py-1">{b.year.replace(/^F/, '')}</td>
                    <td className="py-1 text-right tabular-nums">{formatCurrency(b.assets, units)}</td>
                    <td className="py-1 text-right tabular-nums">{formatCurrency(b.liab_plus_equity, units)}</td>
                    <td className={cn('py-1 text-right tabular-nums', Math.abs(b.variancePct) > 0.05 ? 'text-loss' : 'text-muted-foreground')}>{formatCurrency(b.variance, units)}</td>
                    <td className={cn('py-1 text-right tabular-nums', Math.abs(b.variancePct) > 0.05 ? 'text-loss' : 'text-muted-foreground')}>{(b.variancePct * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-2">
              v1 holds long-term debt and common stock flat. Variance shows where the plug accounts would absorb residuals.
            </p>
          </Card>
        </div>
      </div>
    </div>
    </Shell>
  );
};

export default LivingModelPortal;
