import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconInfoCircle,
  IconPlayerPlay,
  IconScale,
  IconSparkles,
  IconX,
} from '@tabler/icons-react';
import globalConfig from '../../../global/globalConfig.json';
import { TickerCombobox } from '../../../src/components/TickerCombobox';
import { Card } from '../../../src/components/ui/card';
import { Badge } from '../../../src/components/ui/badge';
import { Button } from '../../../src/components/ui/button';
import { Input } from '../../../src/components/ui/input';
import { Checkbox } from '../../../src/components/ui/checkbox';
import { Separator } from '../../../src/components/ui/separator';
import { Alert, AlertDescription } from '../../../src/components/ui/alert';
import { Spinner } from '../../../src/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../src/components/ui/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../../src/components/ui/tooltip';
import { formatPerShare, formatPercent } from '../../../Utilities/formatters';
import { readDcfResult, readDrivers } from '../../../src/lib/crossPortalStore';
import { cn } from '../../../src/lib/utils';

// ---------------------------------------------------------------------------
// Display helpers — kept inline because the formatting is multiple-specific
// (multiples are pure ratios, no $ scaling; growth/margin/ROE are decimals
// stored as fractions in yfinance's payload).
// ---------------------------------------------------------------------------
const fmtMultiple = (v) =>
  v == null || Number.isNaN(v) ? '—' : `${v.toFixed(1)}x`;

const fmtPctDec = (v, dp = 1) =>
  v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(dp)}%`;

const fmtMillions = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
};

const authHeader = () => ({
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + sessionStorage.getItem('token'),
});

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

const FlagBadge = ({ children }) => (
  <Badge variant="warning" className="text-[10px] px-1.5 py-0">{children}</Badge>
);

const MultipleHeaderCell = ({ name, recommended }) => (
  <TableHead
    className={cn(
      'text-right whitespace-nowrap',
      recommended && 'bg-accent/10 text-accent font-semibold'
    )}
  >
    {name}
    {recommended && (
      <span className="ml-1 text-[8px] uppercase tracking-wider">★</span>
    )}
  </TableHead>
);

const MultipleCell = ({ value, highlight }) => (
  <TableCell
    className={cn(
      'text-right tabular-nums',
      highlight && 'bg-accent/[0.06] font-semibold'
    )}
  >
    {fmtMultiple(value)}
  </TableCell>
);

const CATEGORY_ORDER = ['Valuation', 'Growth', 'Leverage', 'Capital', 'Profitability'];

// Single registry of every ratio that can show as a column. `key` matches
// what the backend returns in `category_ratios`, so the same lookup path
// works for the target and every peer. Order within a category matters —
// it's the order columns render in.
const ALL_COLUMNS = [
  // Valuation
  { key: 'EV/EBITDA',           label: 'EV/EBITDA',           category: 'Valuation' },
  { key: 'EV/EBIT',             label: 'EV/EBIT',             category: 'Valuation' },
  { key: 'EV/Sales',            label: 'EV/Sales',            category: 'Valuation' },
  { key: 'P/E',                 label: 'P/E',                 category: 'Valuation' },
  { key: 'P/B',                 label: 'P/B',                 category: 'Valuation' },
  // Growth
  { key: 'revenue_growth_ttm',  label: 'Rev growth',          category: 'Growth' },
  { key: 'earnings_growth_ttm', label: 'Earnings growth',     category: 'Growth' },
  // Leverage
  { key: 'interest_coverage',   label: 'Interest coverage',   category: 'Leverage' },
  { key: 'net_debt_to_ebitda',  label: 'Net Debt/EBITDA',     category: 'Leverage' },
  // Capital
  { key: 'debt_to_equity',      label: 'Debt/Equity',         category: 'Capital' },
  { key: 'debt_to_total_cap',   label: 'Debt/Total Cap',      category: 'Capital' },
  // Profitability
  { key: 'gross_margin',        label: 'Gross margin',        category: 'Profitability' },
  { key: 'operating_margin',    label: 'Op margin',           category: 'Profitability' },
  { key: 'net_margin',          label: 'Net margin',          category: 'Profitability' },
  { key: 'return_on_equity',    label: 'ROE',                 category: 'Profitability' },
];

const COLUMNS_BY_KEY = ALL_COLUMNS.reduce((acc, c) => { acc[c.key] = c; return acc; }, {});

// Sensible defaults — the original 8-column lineup so existing users see
// the same thing they did before the picker landed.
const DEFAULT_VISIBLE = [
  'revenue_growth_ttm', 'operating_margin', 'return_on_equity',
  'EV/EBITDA', 'EV/EBIT', 'EV/Sales', 'P/E', 'P/B',
];

// Format a ratio depending on its category-natural unit.
const fmtRatioValue = (v, key) => {
  if (v == null || Number.isNaN(v)) return '—';
  if (key === 'EV/EBITDA' || key === 'EV/EBIT' || key === 'EV/Sales' || key === 'P/E' || key === 'P/B' || key === 'interest_coverage') {
    return `${v.toFixed(1)}x`;
  }
  if (key === 'net_debt_to_ebitda') {
    return `${v.toFixed(2)}x`;
  }
  if (key === 'debt_to_equity' || key === 'debt_to_total_cap') {
    return v.toFixed(2);
  }
  // growth, margin, ROE — fractions from yfinance
  return `${(v * 100).toFixed(1)}%`;
};

// Median across an array of numbers, ignoring null/undefined/NaN.
const median = (values) => {
  const clean = values.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
};

// Click-outside-to-close dropdown panel with category-grouped checkboxes.
const ColumnPicker = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = (key) => {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else {
      // preserve ALL_COLUMNS order in the visible list
      const next = ALL_COLUMNS.filter((c) => selected.includes(c.key) || c.key === key).map((c) => c.key);
      onChange(next);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        className="h-7 text-xs"
      >
        Columns ({selected.length})
      </Button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-card border border-border rounded-md shadow-lg z-20 p-3 max-h-[480px] overflow-auto">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} className="mb-3 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                {cat}
              </div>
              <div className="space-y-1">
                {ALL_COLUMNS.filter((c) => c.category === cat).map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-card-hover/40 px-1 py-0.5 rounded"
                  >
                    <Checkbox
                      checked={selected.includes(col.key)}
                      onCheckedChange={() => toggle(col.key)}
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main portal
// ---------------------------------------------------------------------------

const RelativeValuationPortal = () => {
  const [targetTickers, setTargetTickers] = useState([]); // TickerCombobox uses an array; we take [0]
  const [overridePeers, setOverridePeers] = useState([]); // post-load: user can add/remove
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE);

  // Reverse-DCF cross-check
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseData, setReverseData] = useState(null);
  const [reverseError, setReverseError] = useState(null);

  const target = targetTickers[0] || '';

  // Read DCF result + Living Model drivers from the sister portals.
  const dcfCached = useMemo(() => readDcfResult(target), [target, data]);
  const driversCached = useMemo(() => readDrivers(target), [target, data]);

  const runValuation = async (peersOverride) => {
    if (!target) {
      setError('Pick a target ticker first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = {
        ticker: target,
        dcf_per_share: dcfCached?.perShareValue ?? null,
      };
      if (peersOverride && peersOverride.length > 0) {
        body.override_peers = peersOverride;
      }
      const r = await axios.post(
        globalConfig.appUrl + '/api/analysis/relative-valuation',
        body,
        { headers: authHeader() }
      );
      setData(r.data);
      // Seed override list with the returned peer set so the user can
      // edit from there without losing the suggestions.
      setOverridePeers((r.data.peers || []).map((p) => p.fundamentals.symbol));
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Failed to run relative valuation');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const runReverseDCF = async () => {
    if (!data || !data.target?.current_price) {
      setReverseError('No market price available — can\'t run reverse DCF.');
      return;
    }
    // We need report_type + period to call /reverse-dcf. Default to the
    // most recent annual filing — the backend's reverse-dcf path finds
    // the latest 10-K for whatever year string we pass containing the
    // current year. Falls back to the cached DCF's period when available.
    const period = String(new Date().getFullYear() - 1);
    setReverseLoading(true);
    setReverseError(null);
    try {
      const r = await axios.post(
        globalConfig.appUrl + '/api/analysis/reverse-dcf',
        {
          ticker: target,
          report_type: '10-K',
          period,
          target_price: data.target.current_price,
          solve_for: 'revenue_growth',
          discount_rate: dcfCached?.discountRate || 0.10,
          interim_growth_rate: dcfCached?.interimGrowthRate || 0.05,
          terminal_growth_rate: dcfCached?.terminalGrowthRate || 0.03,
          forecast_periods: dcfCached?.forecastPeriods || 5,
        },
        { headers: authHeader() }
      );
      setReverseData(r.data);
    } catch (e) {
      setReverseError(e.response?.data?.detail || e.message || 'Reverse DCF failed');
      setReverseData(null);
    } finally {
      setReverseLoading(false);
    }
  };

  // Reset reverse data when target changes.
  useEffect(() => {
    setReverseData(null);
    setReverseError(null);
  }, [target]);

  // Add / remove peer chips
  const addPeer = (sym) => {
    const s = sym.trim().toUpperCase();
    if (!s || overridePeers.includes(s) || s === target) return;
    const next = [...overridePeers, s];
    setOverridePeers(next);
    runValuation(next);
  };
  const removePeer = (sym) => {
    const next = overridePeers.filter((p) => p !== sym);
    setOverridePeers(next);
    runValuation(next);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ===================== Search bar ===================== */}
      <div className="border-b border-border bg-card/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent px-1.5 py-1 rounded bg-accent/10">
            Relative Valuation
          </span>
          <div className="flex-1 min-w-[220px] max-w-[420px]">
            <TickerCombobox
              value={targetTickers}
              onChange={(arr) => setTargetTickers(arr.slice(-1))} // single-ticker target
              placeholder="Pick the target company…"
            />
          </div>
          <Button size="sm" onClick={() => runValuation(overridePeers)} disabled={loading || !target}>
            {loading ? <Spinner size="sm" className="mr-1.5" /> : <IconPlayerPlay size={14} className="mr-1.5" />}
            Run
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1.5 px-1.5">
          Comps the target against peers from the same SIC industry. Peer fundamentals are TTM
          (trailing-twelve-month) from yfinance — same window banks/sell-side use.
          {dcfCached && (
            <span className="ml-2 text-accent">
              · DCF intrinsic loaded from Fundamentals: {formatPerShare(dcfCached.perShareValue)}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {error && (
          <Alert variant="destructive">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!data && !loading && !error && (
          <Card className="p-6 max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <IconScale size={20} className="text-accent" />
              <h2 className="text-lg font-semibold">Relative Valuation</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Pick a target ticker above and click <strong>Run</strong>. We'll:
            </p>
            <ol className="text-sm pl-5 list-decimal space-y-1 text-foreground">
              <li>Suggest a peer set from the same SIC industry, ranked by revenue-size proximity.</li>
              <li>Compute EV/EBITDA, EV/EBIT, EV/Sales, P/E, and P/B for the target and each peer.</li>
              <li>Recommend the 2–3 multiples that are most trustworthy for this company (negative-EBITDA suppression, financial-sector switch to P/B + ROE, wide D&A dispersion → EV/EBIT, etc.).</li>
              <li>For each recommended multiple, decompose the target-vs-peer spread into growth / margin / ROE attribution.</li>
              <li>Reconcile against your DCF intrinsic value (loaded from the Fundamentals DCF tab) so you can see the two valuation methods side-by-side.</li>
            </ol>
            {!dcfCached && (
              <p className="text-xs text-muted-foreground mt-3">
                <IconInfoCircle size={12} className="inline mr-1" />
                Tip: run the DCF in the Fundamentals portal first — the intrinsic value gets read
                here automatically for the reconciliation card.
              </p>
            )}
          </Card>
        )}

        {data && (
          <>
            {/* ============= Target header ============= */}
            <Card className="p-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <IconScale size={20} className="text-accent" />
                    <h2 className="text-xl font-semibold">{data.target.ticker}</h2>
                    <span className="text-sm text-muted-foreground">{data.target.company_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {data.target.industry || '—'} · {data.target.sector || '—'} · SIC {data.target.sic || '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current price</div>
                  <div className="text-2xl font-bold tabular-nums text-accent">
                    {formatPerShare(data.target.current_price)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Mkt cap {fmtMillions(data.target.fundamentals?.market_cap)} · EV {fmtMillions(data.target.fundamentals?.enterprise_value)}
                  </div>
                </div>
              </div>
            </Card>

            {/* ============= Layer 1a: recommended multiples banner ============= */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <IconSparkles size={14} className="text-accent" />
                <h3 className="text-sm font-semibold">Recommended multiples</h3>
                <div className="flex items-center gap-1.5 ml-2">
                  {data.recommended_multiples?.map((m) => (
                    <Badge key={m} variant="default" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1.5">
                {(data.selection_reasoning || []).map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-accent">·</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* ============= Layer 1b: peer set + multiples table ============= */}
            <Card className="p-4">
              <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">Peer set ({data.peers?.length || 0})</h3>
                  {data.target?.industry && (
                    <span className="text-xs text-muted-foreground">
                      · Industry: <span className="font-medium text-foreground">{data.target.industry}</span>
                    </span>
                  )}
                  {data.peer_source && (
                    <Badge
                      variant={data.peer_source === 'user' ? 'muted' : data.peer_source === 'edgar_industry_cache' ? 'default' : 'warning'}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {data.peer_source === 'edgar_industry_cache' ? 'EDGAR industry'
                        : data.peer_source === 'curated' ? 'curated'
                        : data.peer_source === 'merged' ? 'EDGAR + curated'
                        : 'manual'}
                    </Badge>
                  )}
                </div>
                <PeerAdder onAdd={addPeer} />
              </div>

              {data.warnings?.length > 0 && (
                <Alert variant="warning" className="mb-3">
                  <IconAlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {data.warnings.map((w, i) => (
                      <div key={i} className={i > 0 ? 'mt-1' : ''}>{w}</div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(data.peers || []).map((p) => (
                  <div key={p.fundamentals.symbol} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card-hover/40 text-xs">
                    <span className="font-semibold">{p.fundamentals.symbol}</span>
                    {p.flags?.map((f) => (
                      <FlagBadge key={f.code}>{f.label}</FlagBadge>
                    ))}
                    <button
                      onClick={() => removePeer(p.fundamentals.symbol)}
                      aria-label={`Remove ${p.fundamentals.symbol}`}
                      className="text-muted-foreground hover:text-loss ml-0.5"
                    >
                      <IconX size={11} />
                    </button>
                  </div>
                ))}
              </div>

              {data.dropped_candidates?.length > 0 && (
                <div className="text-[10px] text-muted-foreground mb-2">
                  Dropped (no TTM data): {data.dropped_candidates.map((d) => d.ticker).join(', ')}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[10px] text-muted-foreground">
                  ★ marks the multiples the engine recommends for this company.
                </div>
                <ColumnPicker selected={visibleColumns} onChange={setVisibleColumns} />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      {visibleColumns.map((key) => {
                        const col = COLUMNS_BY_KEY[key];
                        if (!col) return null;
                        return (
                          <MultipleHeaderCell
                            key={key}
                            name={col.label}
                            recommended={data.recommended_multiples?.includes(key)}
                          />
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Target row */}
                    <TableRow className="bg-accent/5">
                      <TableCell className="font-semibold text-accent">{data.target.ticker}</TableCell>
                      {visibleColumns.map((key) => (
                        <TableCell
                          key={key}
                          className={cn(
                            'text-right tabular-nums',
                            data.recommended_multiples?.includes(key) && 'bg-accent/[0.06] font-semibold'
                          )}
                        >
                          {fmtRatioValue(data.target.category_ratios?.[key], key)}
                        </TableCell>
                      ))}
                    </TableRow>
                    {/* Peer rows */}
                    {(data.peers || []).map((p) => (
                      <TableRow key={p.fundamentals.symbol}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{p.fundamentals.symbol}</span>
                            {p.flags?.map((f) => <FlagBadge key={f.code}>{f.label}</FlagBadge>)}
                          </div>
                        </TableCell>
                        {visibleColumns.map((key) => (
                          <TableCell
                            key={key}
                            className={cn(
                              'text-right tabular-nums',
                              data.recommended_multiples?.includes(key) && 'bg-accent/[0.06]'
                            )}
                          >
                            {fmtRatioValue(p.category_ratios?.[key], key)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {/* Peer median row — always at the bottom, peers only (target excluded). */}
                    <TableRow className="border-t-2 bg-card-hover/40">
                      <TableCell className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                        Peer median
                      </TableCell>
                      {visibleColumns.map((key) => {
                        const med = median((data.peers || []).map((p) => p.category_ratios?.[key]));
                        return (
                          <TableCell
                            key={key}
                            className={cn(
                              'text-right tabular-nums font-semibold',
                              data.recommended_multiples?.includes(key) && 'bg-accent/[0.06]'
                            )}
                          >
                            {fmtRatioValue(med, key)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>


            {/* ============= Layer 3: reconciliation ============= */}
            <Card className="p-5 border-accent/40">
              <div className="flex items-center gap-2 mb-3">
                <IconArrowRight size={16} className="text-accent" />
                <h3 className="text-sm font-semibold">Reconciliation — Intrinsic vs Relative vs Market</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-md border border-border bg-card-hover/30">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">DCF intrinsic</div>
                  <div className="text-2xl font-bold tabular-nums mt-1">
                    {dcfCached ? formatPerShare(dcfCached.perShareValue) : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {dcfCached ? 'From your Fundamentals · DCF tab' : 'Run DCF in Fundamentals to populate'}
                  </div>
                </div>
                <div className="p-3 rounded-md border border-accent/40 bg-accent/[0.06]">
                  <div className="text-[10px] uppercase tracking-wider text-accent">Relative-implied</div>
                  <div className="text-2xl font-bold tabular-nums mt-1 text-accent">
                    {data.reconciliation?.relative_implied_per_share != null
                      ? formatPerShare(data.reconciliation.relative_implied_per_share)
                      : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Avg of per-multiple implied per-share (recommended set)
                  </div>
                </div>
                <div className="p-3 rounded-md border border-border bg-card-hover/30">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current market</div>
                  <div className="text-2xl font-bold tabular-nums mt-1">
                    {formatPerShare(data.target.current_price)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Latest yfinance close
                  </div>
                </div>
              </div>

              <ReconciliationNarrative
                dcf={dcfCached?.perShareValue}
                relative={data.reconciliation?.relative_implied_per_share}
                market={data.target.current_price}
              />

              <Separator className="my-4" />

              <div>
                <div className="text-xs font-semibold mb-1.5">Per-multiple breakdown</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Multiple</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Peer median</TableHead>
                      <TableHead className="text-right">Implied per share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.reconciliation?.rows || []).map((r) => (
                      <TableRow key={r.multiple}>
                        <TableCell className="text-xs font-medium">{r.multiple}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{fmtMultiple(r.target_multiple)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{fmtMultiple(r.peer_median_multiple)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-semibold text-accent">
                          {formatPerShare(r.implied_per_share)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* ============= Implied-driver cross-check (reverse DCF) ============= */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <IconArrowRight size={16} className="text-accent" />
                <h3 className="text-sm font-semibold">Implied-driver cross-check (reverse DCF)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Solve the DCF backward at the current market price to back out the revenue growth
                the market is pricing in. Compare to the baseline growth in your Living Model.
              </p>

              {!reverseData && (
                <Button size="sm" onClick={runReverseDCF} disabled={reverseLoading}>
                  {reverseLoading ? <Spinner size="sm" className="mr-1.5" /> : null}
                  Solve at market price
                </Button>
              )}

              {reverseError && (
                <Alert variant="destructive" className="mt-3">
                  <AlertDescription>{reverseError}</AlertDescription>
                </Alert>
              )}

              {reverseData && reverseData.converged && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div className="p-3 rounded-md border border-border">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Market-implied revenue growth</div>
                    <div className="text-3xl font-bold tabular-nums text-accent">
                      {fmtPctDec(reverseData.implied_value, 2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Solves DCF to ${reverseData.dcf_price_at_solution?.toFixed(2)} vs target ${reverseData.target_price?.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-3 rounded-md border border-border">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Your Living Model baseline</div>
                    <div className="text-3xl font-bold tabular-nums">
                      {driversCached?.drivers?.revenueGrowth != null
                        ? fmtPctDec(driversCached.drivers.revenueGrowth, 2)
                        : '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {driversCached
                        ? 'From the Living Model portal'
                        : 'Open Living Model to populate'}
                    </div>
                  </div>
                  <div className="md:col-span-2 text-xs leading-relaxed">
                    {reverseData.implied_value != null && driversCached?.drivers?.revenueGrowth != null && (
                      <ImpliedVsBaseNarrative
                        implied={reverseData.implied_value}
                        base={driversCached.drivers.revenueGrowth}
                        ticker={data.target.ticker}
                      />
                    )}
                  </div>
                </div>
              )}

              {reverseData && !reverseData.converged && (
                <Alert variant="warning" className="mt-3">
                  <AlertDescription>
                    Solver did not converge — the market price is outside the bounds of the
                    reverse-DCF search. Try the Fundamentals · DCF tab's reverse-DCF panel
                    with a tighter range.
                  </AlertDescription>
                </Alert>
              )}
            </Card>

            {/* ============= Assumptions footer ============= */}
            <Card className="p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Assumptions
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
                {Object.entries(data.assumptions || {}).map(([k, v]) => (
                  <li key={k}><strong className="text-foreground capitalize">{k.replace(/_/g, ' ')}:</strong> {v}</li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {loading && !data && (
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Spinner size="sm" />
              <div className="text-sm">Pulling peer fundamentals (8 yfinance calls in parallel)…</div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Smaller helpers used in render
// ---------------------------------------------------------------------------

const PeerAdder = ({ onAdd }) => {
  const [val, setVal] = useState('');
  const submit = () => {
    if (val.trim()) {
      onAdd(val);
      setVal('');
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        placeholder="Add peer"
        className="h-7 text-xs w-28"
      />
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={submit}>+</Button>
    </div>
  );
};

const ReconciliationNarrative = ({ dcf, relative, market }) => {
  if (dcf == null && relative == null) return null;
  const parts = [];
  if (dcf != null && relative != null) {
    const gap = dcf - relative;
    const pctGap = relative > 0 ? (gap / relative) * 100 : 0;
    parts.push(
      gap > 0
        ? `Your DCF intrinsic (${formatPerShare(dcf)}) is ${pctGap.toFixed(0)}% above the peer-implied value (${formatPerShare(relative)}). Either you're more optimistic on cash flows than the peer set, or peers are mispriced as a group.`
        : `Peers imply ${formatPerShare(relative)} — ${Math.abs(pctGap).toFixed(0)}% above your DCF intrinsic of ${formatPerShare(dcf)}. The market may be overpricing the sector, or your DCF assumptions may be too conservative.`
    );
  }
  if (market != null && relative != null) {
    const mkt_vs_rel = market - relative;
    parts.push(
      mkt_vs_rel > 0
        ? `Market price ${formatPerShare(market)} sits above the peer-implied ${formatPerShare(relative)} — the market is paying a premium vs comparable companies.`
        : `Market price ${formatPerShare(market)} is below peer-implied ${formatPerShare(relative)} — the market is pricing this name at a discount vs peers.`
    );
  }
  if (market != null && dcf != null) {
    const mkt_vs_dcf = market - dcf;
    parts.push(
      mkt_vs_dcf > 0
        ? `Market ${formatPerShare(market)} sits above your intrinsic ${formatPerShare(dcf)} by ${formatPerShare(mkt_vs_dcf)} — you'd be paying more than the cash flows justify.`
        : `Market ${formatPerShare(market)} is below your intrinsic ${formatPerShare(dcf)} by ${formatPerShare(Math.abs(mkt_vs_dcf))} — implied upside if your DCF assumptions are right.`
    );
  }
  return (
    <div className="text-xs text-foreground leading-relaxed bg-card-hover/30 p-3 rounded-md">
      {parts.map((p, i) => <div key={i} className={i > 0 ? 'mt-1.5' : ''}>{p}</div>)}
    </div>
  );
};

const ImpliedVsBaseNarrative = ({ implied, base, ticker }) => {
  const gap = base - implied;
  const direction = gap > 0 ? 'higher' : 'lower';
  return (
    <div className="bg-card-hover/30 p-3 rounded-md">
      {gap > 0
        ? `The market prices in ${(implied * 100).toFixed(1)}% revenue growth for ${ticker}; your Living Model baseline is ${(base * 100).toFixed(1)}% — ${Math.abs(gap * 100).toFixed(1)}pp ${direction}. Either the market is too pessimistic OR your driver baseline is too optimistic.`
        : `The market prices in ${(implied * 100).toFixed(1)}% revenue growth for ${ticker}; your Living Model baseline is ${(base * 100).toFixed(1)}% — ${Math.abs(gap * 100).toFixed(1)}pp ${direction}. Either the market is too optimistic OR your driver baseline is too conservative.`}
    </div>
  );
};

export default RelativeValuationPortal;
