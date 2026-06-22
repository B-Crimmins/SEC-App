// ---------------------------------------------------------------------------
// Living Model projection engine. Pure JS, no React, no API calls.
//
// Three exports:
//   extractHistory(statements, years)   → time-series of canonical line items
//   extractDrivers(history)             → trailing-baseline drivers for the UI
//   projectModel(history, drivers, horizon=5)
//                                       → projected statements + FCF series +
//                                         diagnostics (warnings, balance check)
//
// The output `statements` shape matches GetMultiParsedData on the backend so
// the LinkageDiagram and NewTrendTable can consume projected data with no
// changes. Forecast year keys are prefixed with `F` (e.g. "F2025") so the UI
// can visually distinguish them from historical year labels.
//
// CIRCULARITY: v1 holds long-term debt flat at the most recent historical
// level, then computes interest_t = debt_{t-1} × historical_implied_rate.
// Same dollar value as "frozen interest" but the math reads "rate × prior
// debt" so a future debt-schedule driver can land cleanly.
// ---------------------------------------------------------------------------

import { lookup } from './canonicalLineItems';

const FORECAST_PREFIX = 'F';

// Lookup canonical line item across every period in a year list. Missing
// periods → null. Order preserved.
const series = (statements, statementKey, lineId, years) =>
  years.map((yr) => lookup(statements, statementKey, lineId, yr));

const safeAbs = (v) => (v == null ? null : Math.abs(v));
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => {
  const clean = xs.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length === 0) return null;
  return sum(clean) / clean.length;
};
const safeDiv = (n, d) => {
  if (n == null || d == null) return null;
  if (d === 0) return null;
  return n / d;
};

// ---------------------------------------------------------------------------
// 1. History — pull canonical series from a categorized statements blob.
// ---------------------------------------------------------------------------
//
// Returns:
//   {
//     years: [...sorted ascending],
//     revenue: [v_y1, v_y2, ...],
//     cogs: [...],
//     ...all canonical line items the projection needs...
//   }
export const extractHistory = (statements, years) => {
  // Sort ascending so YoY math reads left-to-right.
  const sorted = [...(years || [])].sort((a, b) => String(a).localeCompare(String(b)));

  const r = {
    years: sorted,
    revenue:           series(statements, 'income_statement', 'is-revenue', sorted),
    cogs:              series(statements, 'income_statement', 'is-cogs', sorted),
    operating_income:  series(statements, 'income_statement', 'is-operating', sorted),
    operating_expense: series(statements, 'income_statement', 'is-opex', sorted),
    interest_expense:  series(statements, 'income_statement', 'is-interest', sorted),
    tax_expense:       series(statements, 'income_statement', 'is-tax', sorted),
    net_income:        series(statements, 'income_statement', 'is-net-income', sorted),
    pretax_income:     series(statements, 'income_statement', 'is-pretax', sorted),

    cash:              series(statements, 'balance_sheet',    'bs-cash', sorted),
    ar:                series(statements, 'balance_sheet',    'bs-ar', sorted),
    inventory:         series(statements, 'balance_sheet',    'bs-inventory', sorted),
    ppe:               series(statements, 'balance_sheet',    'bs-ppe', sorted),
    total_assets:      series(statements, 'balance_sheet',    'bs-total-assets', sorted),
    ap:                series(statements, 'balance_sheet',    'bs-ap', sorted),
    debt:              series(statements, 'balance_sheet',    'bs-debt', sorted),
    common_stock:      series(statements, 'balance_sheet',    'bs-common-stock', sorted),
    retained_earnings: series(statements, 'balance_sheet',    'bs-retained', sorted),
    total_equity:      series(statements, 'balance_sheet',    'bs-total-equity', sorted),
    total_liab:        series(statements, 'balance_sheet',    'bs-total-liab', sorted),

    da:                series(statements, 'cash_flow',        'cf-depreciation', sorted),
    capex:             series(statements, 'cash_flow',        'cf-capex', sorted).map(safeAbs),
    dividends:         series(statements, 'cash_flow',        'cf-dividends', sorted).map(safeAbs),

    // Historical CF totals + working-capital line items (signed as the
    // filer reports them — i.e. AR growth = negative cash impact). These
    // make the historical CF column foot the same way the projected one
    // does in the Living Model display.
    cf_operating:      series(statements, 'cash_flow',        'cf-operating', sorted),
    cf_investing:      series(statements, 'cash_flow',        'cf-investing', sorted),
    cf_financing:      series(statements, 'cash_flow',        'cf-financing', sorted),
    cf_net_change:     series(statements, 'cash_flow',        'cf-net-change', sorted),
    cf_delta_ar:       series(statements, 'cash_flow',        'cf-change-ar', sorted),
    cf_delta_inv:      series(statements, 'cash_flow',        'cf-change-inv', sorted),
    cf_delta_ap:       series(statements, 'cash_flow',        'cf-change-ap', sorted),
  };

  // Back-fill gross profit, op-income, operating expense from siblings when
  // the standalone tag was missing — mirrors the backend's defensive logic.
  r.gross_profit = sorted.map((_, i) => {
    if (r.revenue[i] != null && r.cogs[i] != null) return r.revenue[i] - r.cogs[i];
    return null;
  });
  r.operating_expense_derived = sorted.map((_, i) => {
    if (r.operating_expense[i] != null) return r.operating_expense[i];
    if (r.gross_profit[i] != null && r.operating_income[i] != null) {
      return r.gross_profit[i] - r.operating_income[i];
    }
    return null;
  });

  // Derive "other" plug accounts so the historical BS reads with the same
  // row structure as the forecast: everything the model doesn't explicitly
  // project (marketable securities, goodwill, deferred tax, AOCI, etc.)
  // gets collapsed into a single per-statement-side row.
  r.other_assets = sorted.map((_, i) => {
    const ta = r.total_assets[i];
    if (ta == null) return null;
    const operating = (r.cash[i] ?? 0) + (r.ar[i] ?? 0) + (r.inventory[i] ?? 0) + (r.ppe[i] ?? 0);
    return ta - operating;
  });
  // Total liabilities is often missing as a discrete line — derive from
  // assets − equity when not tagged directly.
  r.total_liab_derived = sorted.map((_, i) => {
    if (r.total_liab[i] != null) return r.total_liab[i];
    if (r.total_assets[i] != null && r.total_equity[i] != null) {
      return r.total_assets[i] - r.total_equity[i];
    }
    return null;
  });
  r.other_liab = sorted.map((_, i) => {
    const tl = r.total_liab_derived[i];
    if (tl == null) return null;
    const operating = (r.ap[i] ?? 0) + (r.debt[i] ?? 0);
    return tl - operating;
  });
  r.other_equity = sorted.map((_, i) => {
    const te = r.total_equity[i];
    if (te == null) return null;
    const explicit = (r.common_stock[i] ?? 0) + (r.retained_earnings[i] ?? 0);
    return te - explicit;
  });

  return r;
};

// ---------------------------------------------------------------------------
// 2. Drivers — average historical ratios to seed the user's starting point.
// ---------------------------------------------------------------------------
//
// Returns:
//   {
//     drivers: { revenueGrowth, grossMargin, opexPct, dso, dio, dpo,
//                capexPct, daPct, taxRate, interestRate, dividendPayout },
//     baselines: { ...trailing values for the UI to surface as anchors... }
//   }
export const extractDrivers = (history) => {
  const N = history.years.length;
  if (N === 0) return { drivers: {}, baselines: {} };

  // YoY revenue growth — pair-wise across all historical years.
  const yoyGrowths = [];
  for (let i = 1; i < N; i++) {
    const prev = history.revenue[i - 1];
    const curr = history.revenue[i];
    if (prev != null && curr != null && prev > 0) {
      yoyGrowths.push((curr - prev) / prev);
    }
  }

  // Per-year ratios — averaged across whatever periods have both inputs.
  const grossMargins  = history.years.map((_, i) =>
    safeDiv(history.gross_profit[i], history.revenue[i])
  );
  const opexPcts      = history.years.map((_, i) =>
    safeDiv(history.operating_expense_derived[i], history.revenue[i])
  );
  const dsoVals       = history.years.map((_, i) => {
    const ar = history.ar[i];
    const rev = history.revenue[i];
    if (ar == null || rev == null || rev === 0) return null;
    return (ar / rev) * 365;
  });
  const dioVals       = history.years.map((_, i) => {
    const inv = history.inventory[i];
    const cogs = history.cogs[i];
    if (inv == null || cogs == null || cogs === 0) return null;
    return (inv / cogs) * 365;
  });
  const dpoVals       = history.years.map((_, i) => {
    const ap = history.ap[i];
    const cogs = history.cogs[i];
    if (ap == null || cogs == null || cogs === 0) return null;
    return (ap / cogs) * 365;
  });
  const capexPcts     = history.years.map((_, i) =>
    safeDiv(history.capex[i], history.revenue[i])
  );
  const daPcts        = history.years.map((_, i) =>
    safeDiv(history.da[i], history.revenue[i])
  );
  const taxRates      = history.years.map((_, i) => {
    const tax = history.tax_expense[i];
    let pretax = history.pretax_income[i];
    if (pretax == null) {
      // Derive: OpIncome + InterestExpense (signed) — matches the backend
      // pretax fallback so the rate is comparable across surfaces.
      const op = history.operating_income[i];
      const ie = history.interest_expense[i];
      if (op != null && ie != null) pretax = op + ie;
    }
    if (tax == null || pretax == null || pretax <= 0) return null;
    return tax / pretax;
  });
  // Interest rate: use the LAST historical year's implied rate only.
  // mean-of-ratios across years blows up when the bs-debt regex matches
  // a small sub-line in one year (e.g. a current-portion stub) and the
  // real LT-debt total in another — a $15M denom on $100M interest
  // produces a 667% rate that averages with real 5% rates into a 336%
  // mean. Multiplied back by current debt, that gave $13B+ phantom
  // interest projections. Last-year-only is robust and matches what
  // the user actually sees in the historical column.
  const lastIdx = history.years.length - 1;
  const lastIE = lastIdx >= 0 ? history.interest_expense[lastIdx] : null;
  const lastDebt = lastIdx >= 0 ? history.debt[lastIdx] : null;
  const lastYearInterestRate =
    (lastIE != null && lastDebt != null && lastDebt > 0)
      ? Math.abs(lastIE) / lastDebt
      : null;
  const dividendPayouts = history.years.map((_, i) =>
    safeDiv(history.dividends[i], history.net_income[i])
  );

  // Non-operating BS plugs as % of revenue (marketable securities,
  // goodwill, deferred tax, etc. on the asset side; deferred revenue,
  // pension obligations, accrued liabilities on the liability side).
  // Scaling with revenue is a pragmatic v1 — keeps the BS footing while
  // not pretending we modeled each line individually.
  const otherAssetsPcts = history.years.map((_, i) =>
    safeDiv(history.other_assets[i], history.revenue[i])
  );
  const otherLiabPcts = history.years.map((_, i) =>
    safeDiv(history.other_liab[i], history.revenue[i])
  );

  const drivers = {
    revenueGrowth:    mean(yoyGrowths) ?? 0.05,
    grossMargin:      mean(grossMargins) ?? 0.30,
    opexPct:          mean(opexPcts) ?? 0.15,
    dso:              mean(dsoVals) ?? 45,
    dio:              mean(dioVals) ?? 60,
    dpo:              mean(dpoVals) ?? 45,
    capexPct:         mean(capexPcts) ?? 0.04,
    daPct:            mean(daPcts) ?? 0.04,
    taxRate:          mean(taxRates) ?? 0.21,
    interestRate:     lastYearInterestRate ?? 0.05,
    dividendPayout:   mean(dividendPayouts) ?? 0,
    otherAssetsPct:   mean(otherAssetsPcts) ?? 0,
    otherLiabPct:     mean(otherLiabPcts) ?? 0,
  };

  const baselines = {
    revenueGrowth:  { values: yoyGrowths,    label: 'YoY revenue growth' },
    grossMargin:    { values: grossMargins,  label: 'Gross margin' },
    opexPct:        { values: opexPcts,      label: 'Operating expense ÷ revenue' },
    dso:            { values: dsoVals,       label: 'Days sales outstanding' },
    dio:            { values: dioVals,       label: 'Days inventory outstanding' },
    dpo:            { values: dpoVals,       label: 'Days payable outstanding' },
    capexPct:       { values: capexPcts,     label: 'CapEx ÷ revenue' },
    daPct:          { values: daPcts,        label: 'D&A ÷ revenue' },
    taxRate:        { values: taxRates,      label: 'Effective tax rate' },
  };

  return { drivers, baselines };
};

// ---------------------------------------------------------------------------
// 3. Projection — build a forward 5-year model from the drivers.
// ---------------------------------------------------------------------------

// Output anchor period = last historical year as integer if parseable.
const inferStartYear = (years) => {
  if (!years || years.length === 0) return 2024;
  const last = years[years.length - 1];
  const n = parseInt(String(last).match(/\d{4}/)?.[0] ?? '', 10);
  return Number.isFinite(n) ? n : 2024;
};

// Build a categorized statements blob (same shape as backend GetMultiParsedData)
// from the projected scalars. Used to feed LinkageDiagram + NewTrendTable.
const buildProjectedStatements = (proj, projYears) => {
  // Helper to map a per-year array of values into `values: {year: number}`
  const yv = (arr) => {
    const out = {};
    projYears.forEach((yr, i) => { if (arr[i] != null) out[yr] = arr[i]; });
    return out;
  };

  return {
    income_statement: {
      Other: [
        { type: 'Revenue',                 value_kind: 'currency', values: yv(proj.revenue) },
        { type: 'Cost of revenue',         value_kind: 'currency', values: yv(proj.cogs) },
        { type: 'Gross profit',            value_kind: 'currency', values: yv(proj.gross_profit) },
        { type: 'Operating expenses',      value_kind: 'currency', values: yv(proj.operating_expense) },
        { type: 'Depreciation',            value_kind: 'currency', values: yv(proj.da) },
        { type: 'Operating income',        value_kind: 'currency', values: yv(proj.ebit) },
        { type: 'Interest expense',        value_kind: 'currency', values: yv(proj.interest) },
        { type: 'Pretax income',           value_kind: 'currency', values: yv(proj.pretax) },
        { type: 'Income tax expense',      value_kind: 'currency', values: yv(proj.tax) },
        { type: 'Net income',              value_kind: 'currency', values: yv(proj.net_income) },
      ],
    },
    balance_sheet: {
      Other: [
        { type: 'Cash and equivalents',    value_kind: 'currency', values: yv(proj.cash) },
        { type: 'Accounts receivable',     value_kind: 'currency', values: yv(proj.ar) },
        { type: 'Inventory',               value_kind: 'currency', values: yv(proj.inventory) },
        { type: 'Property, plant and equipment, net', value_kind: 'currency', values: yv(proj.ppe) },
        { type: 'Total assets',            value_kind: 'currency', values: yv(proj.total_assets) },
        { type: 'Accounts payable',        value_kind: 'currency', values: yv(proj.ap) },
        { type: 'Long-term debt',          value_kind: 'currency', values: yv(proj.debt) },
        { type: 'Total liabilities',       value_kind: 'currency', values: yv(proj.total_liab) },
        { type: 'Common stock',            value_kind: 'currency', values: yv(proj.common_stock) },
        { type: 'Retained earnings',       value_kind: 'currency', values: yv(proj.retained_earnings) },
        { type: 'Total equity',            value_kind: 'currency', values: yv(proj.total_equity) },
      ],
    },
    cash_flow: {
      Other: [
        { type: 'Net income',              value_kind: 'currency', values: yv(proj.net_income) },
        { type: 'Depreciation',            value_kind: 'currency', values: yv(proj.da) },
        { type: 'Accounts receivable',     value_kind: 'currency', values: yv(proj.delta_ar.map((v) => v == null ? null : -v)) },
        { type: 'Inventory',               value_kind: 'currency', values: yv(proj.delta_inv.map((v) => v == null ? null : -v)) },
        { type: 'Accounts payable',        value_kind: 'currency', values: yv(proj.delta_ap) },
        { type: 'Net cash provided by operating activities', value_kind: 'currency', values: yv(proj.cf_operating) },
        { type: 'Capital expenditures',    value_kind: 'currency', values: yv(proj.capex.map((v) => v == null ? null : -v)) },
        { type: 'Net cash used in investing activities',     value_kind: 'currency', values: yv(proj.cf_investing) },
        { type: 'Dividends paid',          value_kind: 'currency', values: yv(proj.dividends.map((v) => v == null ? null : -v)) },
        { type: 'Net cash provided by financing activities', value_kind: 'currency', values: yv(proj.cf_financing) },
        { type: 'Net change in cash',      value_kind: 'currency', values: yv(proj.delta_cash) },
      ],
    },
  };
};

// Returns {history, drivers, projectedYears, projected (scalars), statements,
//          fcfSeries, warnings, balanceCheck}
export const projectModel = (history, drivers, horizon = 5) => {
  const warnings = [];
  const N = history.years.length;
  if (N === 0) {
    return { warnings: ['No historical years available.'], projected: null };
  }

  // Anchor values from the last historical year.
  const last = N - 1;
  const lastRev   = history.revenue[last] ?? 0;
  const lastPPE   = history.ppe[last] ?? 0;
  const lastCash  = history.cash[last] ?? 0;
  const lastDebt  = history.debt[last] ?? 0;
  const lastEq    = history.total_equity[last] ?? 0;
  const lastRE    = history.retained_earnings[last] ?? 0;
  const lastCS    = history.common_stock[last] ?? Math.max(lastEq - lastRE, 0);
  const lastAR    = history.ar[last] ?? 0;
  const lastInv   = history.inventory[last] ?? 0;
  const lastAP    = history.ap[last] ?? 0;

  if (lastRev <= 0) warnings.push('Latest historical revenue is missing or zero; projection may be unreliable.');

  // Allocate per-year arrays.
  const Y = horizon;
  const startYear = inferStartYear(history.years);
  const projYears = Array.from({ length: Y }, (_, i) => `${FORECAST_PREFIX}${startYear + i + 1}`);

  const proj = {
    revenue:           new Array(Y),
    cogs:              new Array(Y),
    gross_profit:      new Array(Y),
    operating_expense: new Array(Y),
    da:                new Array(Y),
    ebit:              new Array(Y),
    interest:          new Array(Y),
    pretax:            new Array(Y),
    tax:               new Array(Y),
    net_income:        new Array(Y),
    ar:                new Array(Y),
    inventory:         new Array(Y),
    ppe:               new Array(Y),
    cash:              new Array(Y),
    ap:                new Array(Y),
    debt:              new Array(Y),
    common_stock:      new Array(Y),
    retained_earnings: new Array(Y),
    total_assets:      new Array(Y),
    total_liab:        new Array(Y),
    total_equity:      new Array(Y),
    other_assets:      new Array(Y),
    other_liab:        new Array(Y),
    other_equity:      new Array(Y),
    capex:             new Array(Y),
    dividends:         new Array(Y),
    delta_ar:          new Array(Y),
    delta_inv:         new Array(Y),
    delta_ap:          new Array(Y),
    cf_operating:      new Array(Y),
    cf_investing:      new Array(Y),
    cf_financing:      new Array(Y),
    delta_cash:        new Array(Y),
  };

  for (let i = 0; i < Y; i++) {
    const prevRev   = i === 0 ? lastRev  : proj.revenue[i - 1];
    const prevPPE   = i === 0 ? lastPPE  : proj.ppe[i - 1];
    const prevCash  = i === 0 ? lastCash : proj.cash[i - 1];
    const prevDebt  = i === 0 ? lastDebt : proj.debt[i - 1];
    const prevRE    = i === 0 ? lastRE   : proj.retained_earnings[i - 1];
    const prevAR    = i === 0 ? lastAR   : proj.ar[i - 1];
    const prevInv   = i === 0 ? lastInv  : proj.inventory[i - 1];
    const prevAP    = i === 0 ? lastAP   : proj.ap[i - 1];

    // Income statement —
    const rev   = prevRev * (1 + (drivers.revenueGrowth ?? 0));
    const cogs  = rev * (1 - (drivers.grossMargin ?? 0));
    const gross = rev - cogs;
    const opex  = rev * (drivers.opexPct ?? 0);
    const da    = rev * (drivers.daPct ?? 0);
    const ebit  = gross - opex - da;
    // Interest from prior-period debt × historical implied rate (v1 holds
    // debt flat, but the formula will adapt when a debt-growth driver lands)
    const interest = prevDebt * (drivers.interestRate ?? 0);
    const pretax = ebit - interest;
    const tax    = Math.max(0, pretax) * (drivers.taxRate ?? 0);
    const ni     = pretax - tax;

    // Balance sheet WC accounts —
    const ar  = rev  * ((drivers.dso ?? 0) / 365);
    const inv = cogs * ((drivers.dio ?? 0) / 365);
    const ap  = cogs * ((drivers.dpo ?? 0) / 365);

    // CapEx / PP&E rollforward —
    const capex = rev * (drivers.capexPct ?? 0);
    const ppe   = prevPPE + capex - da;

    // Working-capital changes feed Operating CF (rise in AR = cash out).
    const dAR  = ar  - prevAR;
    const dInv = inv - prevInv;
    const dAP  = ap  - prevAP;

    const cfOp  = ni + da - dAR - dInv + dAP;
    const cfInv = -capex;
    // Financing — v1 holds debt flat (so debt issuance/repayment = 0),
    // pays dividends per historical payout × NI.
    const dividends = Math.max(0, ni) * (drivers.dividendPayout ?? 0);
    const cfFin = -dividends;

    const dCash = cfOp + cfInv + cfFin;
    const cash  = prevCash + dCash;

    // Balance sheet plug rows. Non-operating accounts (marketable securities,
    // goodwill, deferred tax assets / accrued liabilities, etc.) scale with
    // revenue at their historical proportion. "Other equity" (AOCI, treasury
    // stock, NCI, and any residual modeling error) is the closing plug — it
    // makes the BS foot by construction so the variance check stays tight.
    const re   = prevRE + ni - dividends;
    const debt = prevDebt; // flat in v1
    const cs   = lastCS;   // flat in v1
    const otherAssets_t = rev * (drivers.otherAssetsPct ?? 0);
    const otherLiab_t   = rev * (drivers.otherLiabPct ?? 0);
    const totalAssets = cash + ar + inv + ppe + otherAssets_t;
    const totalLiab   = debt + ap + otherLiab_t;
    const totalEq     = totalAssets - totalLiab;
    // Backed-out plug — what AOCI + treasury + NCI + any modeling residual
    // would have to be for the BS to balance.
    const otherEquity_t = totalEq - cs - re;

    proj.revenue[i] = rev;
    proj.cogs[i] = cogs;
    proj.gross_profit[i] = gross;
    proj.operating_expense[i] = opex;
    proj.da[i] = da;
    proj.ebit[i] = ebit;
    proj.interest[i] = interest;
    proj.pretax[i] = pretax;
    proj.tax[i] = tax;
    proj.net_income[i] = ni;
    proj.ar[i] = ar;
    proj.inventory[i] = inv;
    proj.ppe[i] = ppe;
    proj.cash[i] = cash;
    proj.ap[i] = ap;
    proj.debt[i] = debt;
    proj.common_stock[i] = cs;
    proj.retained_earnings[i] = re;
    proj.total_assets[i] = totalAssets;
    proj.total_liab[i] = totalLiab;
    proj.total_equity[i] = totalEq;
    proj.other_assets[i] = otherAssets_t;
    proj.other_liab[i] = otherLiab_t;
    proj.other_equity[i] = otherEquity_t;
    proj.capex[i] = capex;
    proj.dividends[i] = dividends;
    proj.delta_ar[i] = dAR;
    proj.delta_inv[i] = dInv;
    proj.delta_ap[i] = dAP;
    proj.cf_operating[i] = cfOp;
    proj.cf_investing[i] = cfInv;
    proj.cf_financing[i] = cfFin;
    proj.delta_cash[i] = dCash;

    if (cash < 0) {
      warnings.push(
        `Financing gap in ${projYears[i]}: cash falls to $${(cash / 1e6).toFixed(1)}M — company would need to raise capital or cut growth.`
      );
    }
  }

  // Balance check — A − (L+E) per year, expressed as a fraction of assets.
  const balanceCheck = proj.total_assets.map((a, i) => {
    const le = (proj.total_liab[i] ?? 0) + (proj.total_equity[i] ?? 0);
    const diff = a - le;
    return { year: projYears[i], assets: a, liab_plus_equity: le, variance: diff, variancePct: a !== 0 ? diff / a : 0 };
  });
  const maxBalanceDrift = Math.max(0, ...balanceCheck.map((b) => Math.abs(b.variancePct)));
  if (maxBalanceDrift > 0.05) {
    warnings.push(
      `Balance sheet drift up to ${(maxBalanceDrift * 100).toFixed(1)}% — assets ≠ liabilities + equity. The plug accounts (debt/equity held flat) are absorbing the variance.`
    );
  }

  // Unlevered free cash flow per year — matches the backend convention:
  //   UFCF = OCF − |CapEx| + |Interest| × (1 − tax_rate)
  const fcfSeries = proj.cf_operating.map((ocf, i) => {
    const ti = (proj.interest[i] ?? 0) * (1 - (drivers.taxRate ?? 0));
    return ocf - (proj.capex[i] ?? 0) + Math.abs(ti);
  });

  return {
    history,
    drivers,
    projYears,
    projected: proj,
    statements: buildProjectedStatements(proj, projYears),
    fcfSeries,
    warnings,
    balanceCheck,
    anchors: {
      lastHistYear: history.years[last],
      lastRev,
      lastPPE,
      lastCash,
      lastDebt,
      lastEquity: lastEq,
      lastRE,
      lastCS,
      lastAR,
      lastInv,
      lastAP,
    },
  };
};
