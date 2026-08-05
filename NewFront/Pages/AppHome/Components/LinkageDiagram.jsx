import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IconGitMerge, IconHandStop, IconInfoCircle, IconRefresh, IconX } from '@tabler/icons-react';
import { Button } from '../../../src/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../src/components/ui/select';
import { useUnits } from '../../../Utilities/UnitsContext';
import { formatCurrency } from '../../../Utilities/formatters';
import { cn } from '../../../src/lib/utils';

// ---------------------------------------------------------------------------
// Line items per statement. `id` is the stable edge handle key. Values are
// populated at render time from the loaded simpleTickerData payload by
// matching XBRL labels through the PATTERNS map below.
// ---------------------------------------------------------------------------

const IS_ITEMS = [
  { id: 'is-revenue',        label: 'Revenue' },
  { id: 'is-cogs',           label: 'Cost of Goods Sold' },
  { id: 'is-gross-profit',   label: 'Gross Profit', bold: true },
  { id: 'is-opex',           label: 'Operating Expenses' },
  { id: 'is-depreciation',   label: 'Depreciation & Amort.' },
  { id: 'is-operating',      label: 'Operating Income', bold: true },
  { id: 'is-interest',       label: 'Interest Expense' },
  { id: 'is-pretax',         label: 'Pre-tax Income' },
  { id: 'is-tax',            label: 'Income Tax Expense' },
  { id: 'is-net-income',     label: 'Net Income', bold: true },
];

const BS_ITEMS = [
  { id: 'bs-cash',           label: 'Cash & Equivalents' },
  { id: 'bs-ar',             label: 'Accounts Receivable' },
  { id: 'bs-inventory',      label: 'Inventory' },
  { id: 'bs-ppe',            label: 'PP&E (net)' },
  { id: 'bs-total-assets',   label: 'Total Assets', bold: true },
  { id: 'bs-ap',             label: 'Accounts Payable' },
  { id: 'bs-taxes-payable',  label: 'Taxes Payable' },
  { id: 'bs-debt',           label: 'Long-term Debt' },
  { id: 'bs-total-liab',     label: 'Total Liabilities', bold: true },
  { id: 'bs-common-stock',   label: 'Common Stock' },
  { id: 'bs-retained',       label: 'Retained Earnings' },
  { id: 'bs-total-equity',   label: 'Total Equity', bold: true },
];

const CF_ITEMS = [
  { id: 'cf-net-income',     label: 'Net Income (starting)' },
  { id: 'cf-depreciation',   label: '+ Depreciation & Amort.' },
  { id: 'cf-deferred-tax',   label: '+ Deferred Taxes' },
  { id: 'cf-change-ar',      label: 'Δ Accounts Receivable' },
  { id: 'cf-change-inv',     label: 'Δ Inventory' },
  { id: 'cf-change-ap',      label: 'Δ Accounts Payable' },
  { id: 'cf-operating',      label: 'Cash from Operations', bold: true },
  { id: 'cf-capex',          label: '− CapEx' },
  { id: 'cf-investing',      label: 'Cash from Investing', bold: true },
  { id: 'cf-debt-issue',     label: 'Debt issuance / (repay)' },
  { id: 'cf-equity-issue',   label: 'Equity issuance / buyback' },
  { id: 'cf-dividends',      label: '− Dividends paid' },
  { id: 'cf-financing',      label: 'Cash from Financing', bold: true },
  { id: 'cf-net-change',     label: 'Net Change in Cash', bold: true },
];

// ---------------------------------------------------------------------------
// XBRL label → canonical line item ID matchers, scoped per statement so that
// e.g. "Net Income" in the IS doesn't collide with "Net income" appearing
// as the starting line of CF Operating. First pattern that hits wins.
// ---------------------------------------------------------------------------

import {
  PATTERNS,
  STATEMENT_KEY_FOR_NODE,
  matchInStatement,
  lookup,
} from '../../../src/lib/canonicalLineItems';

// Values reported negative on the source (CapEx is an outflow). Flip to a
// signed-negative display so the row reads "− $X" and the bs-ppe → cf-capex
// edge shows the magnitude flowing into investing without minus-sign noise.
const SIGN_FLIP = new Set([]);

const buildItems = (nodeId, itemDefs, statements, period, units) => {
  const statementKey = STATEMENT_KEY_FOR_NODE[nodeId];
  const statementData = statements?.[statementKey];
  const patternMap = PATTERNS[statementKey] || {};

  return itemDefs.map((def) => {
    const patterns = patternMap[def.id];
    let value = null;
    let formattedValue = null;
    if (statementData && period && patterns) {
      const found = matchInStatement(statementData, patterns, period);
      if (found) {
        value = SIGN_FLIP.has(def.id) ? -Math.abs(found.value) : found.value;
        formattedValue = formatCurrency(value, units);
      }
    }
    return { ...def, value, formattedValue };
  });
};

// ---------------------------------------------------------------------------
// Custom node — one card per statement. Every line item exposes left+right
// handles (invisible) so edges can attach regardless of how the user
// arranges the three statements. Rows that participate in a linkage get an
// accent left border so the connections are discoverable.
// ---------------------------------------------------------------------------

const StatementNode = ({ data }) => (
  <div className="rounded-lg border border-border bg-card shadow-lg w-[320px]">
    <div className="px-3 py-2 border-b border-border bg-card-hover/40 rounded-t-lg">
      <div className="text-[10px] font-bold uppercase tracking-widest text-accent">{data.subtitle}</div>
      <div className="text-sm font-semibold">{data.title}</div>
    </div>
    <div className="py-1">
      {data.items.map((item) => {
        const linked = LINKED_IDS.has(item.id);
        const hasValue = item.value !== null && item.value !== undefined;
        return (
          <div
            key={item.id}
            className={cn(
              'relative flex items-center gap-2 px-3 py-1 text-xs border-l-2 border-l-transparent pl-2.5',
              item.bold && 'font-semibold border-t border-t-border/40 mt-0.5 pt-1.5',
              linked && 'border-l-accent/70',
              hasValue ? 'text-foreground' : (linked ? 'text-foreground/80' : 'text-muted-foreground')
            )}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={`${item.id}-l`}
              style={{ background: 'transparent', border: 'none', width: 8, height: 8, left: -4 }}
            />
            <span className="truncate flex-1">{item.label}</span>
            {hasValue ? (
              <span className="tabular-nums shrink-0">{item.formattedValue}</span>
            ) : (
              <span className="text-muted-foreground/40 shrink-0 text-[10px]">—</span>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={`${item.id}-r`}
              style={{ background: 'transparent', border: 'none', width: 8, height: 8, right: -4 }}
            />
          </div>
        );
      })}
    </div>
  </div>
);

const nodeTypes = { statement: StatementNode };

// ---------------------------------------------------------------------------
// Canonical 3-statement linkages. Each entry is one drawn arrow. `color`
// groups linkages by financial-flow type.
// ---------------------------------------------------------------------------

const LINKAGES = [
  // IS → BS / CF
  { from: 'is-net-income',     to: 'bs-retained',      label: 'NI → Retained Earnings',          color: 'accent' },
  { from: 'is-net-income',     to: 'cf-net-income',    label: 'NI starts Operating CF',          color: 'accent' },
  { from: 'is-depreciation',   to: 'cf-depreciation',  label: 'Non-cash add-back',               color: 'gain'   },
  { from: 'is-tax',            to: 'bs-taxes-payable', label: 'Tax expense ↔ Taxes Payable',     color: 'gain'   },
  { from: 'is-tax',            to: 'cf-deferred-tax',  label: 'Deferred portion',                color: 'gain'   },

  // BS → CF (working capital + investing/financing)
  { from: 'bs-ar',             to: 'cf-change-ar',     label: 'Δ AR',                            color: 'gain' },
  { from: 'bs-inventory',      to: 'cf-change-inv',    label: 'Δ Inventory',                     color: 'gain' },
  { from: 'bs-ap',             to: 'cf-change-ap',     label: 'Δ AP',                            color: 'gain' },
  { from: 'bs-ppe',            to: 'cf-capex',         label: 'Δ PP&E + D&A = CapEx',            color: 'loss' },
  { from: 'bs-debt',           to: 'cf-debt-issue',    label: 'Δ LT Debt',                       color: 'loss' },
  { from: 'bs-common-stock',   to: 'cf-equity-issue',  label: 'Δ Common Stock',                  color: 'loss' },

  // CF → BS (closing the loop)
  { from: 'cf-net-change',     to: 'bs-cash',          label: 'Σ CF = Δ Cash',                   color: 'accent' },
];

const LINKED_IDS = new Set(LINKAGES.flatMap((l) => [l.from, l.to]));

const colorFor = (name) => ({
  accent: 'hsl(var(--accent))',
  gain:   'hsl(var(--gain))',
  loss:   'hsl(var(--loss))',
}[name] || 'hsl(var(--accent))');

const statementOf = (lineId) =>
  lineId.startsWith('is-') ? 'IS' : lineId.startsWith('bs-') ? 'BS' : 'CF';

// Initial layout — three statements laid out left-to-right. User can drag.
const INITIAL_NODES = [
  { id: 'IS', type: 'statement', position: { x: 0,    y: 0 }, data: { title: 'Income Statement',   subtitle: 'IS', items: IS_ITEMS } },
  { id: 'BS', type: 'statement', position: { x: 520,  y: 0 }, data: { title: 'Balance Sheet',      subtitle: 'BS', items: BS_ITEMS } },
  { id: 'CF', type: 'statement', position: { x: 1040, y: 0 }, data: { title: 'Cash Flow Statement', subtitle: 'CF', items: CF_ITEMS } },
];

// Build edges. If we have a source value, prepend it to the descriptive
// label so the magnitude of each flow is readable on the canvas. Each edge
// carries a `linkKey` so the click handler can look up the rollforward math.
const linkKeyOf = (link) => `${link.from}→${link.to}`;

const buildEdges = (nodesById, selectedLinkKey) => {
  const valueOf = new Map();
  for (const node of nodesById) {
    for (const item of node.data.items) {
      valueOf.set(item.id, { value: item.value, formatted: item.formattedValue });
    }
  }

  return LINKAGES.map((link, i) => {
    const stroke = colorFor(link.color);
    const srcVal = valueOf.get(link.from);
    const labelText = srcVal?.formatted
      ? `${srcVal.formatted} · ${link.label}`
      : link.label;
    const key = linkKeyOf(link);
    const isSelected = key === selectedLinkKey;
    return {
      id: `edge-${i}`,
      source: statementOf(link.from),
      target: statementOf(link.to),
      sourceHandle: `${link.from}-r`,
      targetHandle: `${link.to}-l`,
      label: labelText,
      type: 'smoothstep',
      animated: true,
      data: { linkKey: key },
      style: {
        stroke,
        strokeWidth: isSelected ? 3 : 1.5,
        filter: isSelected ? `drop-shadow(0 0 6px ${stroke})` : undefined,
      },
      labelStyle: {
        fontSize: isSelected ? 11 : 10,
        fill: 'hsl(var(--foreground))',
        fontWeight: isSelected ? 600 : 500,
      },
      labelBgStyle: { fill: 'hsl(var(--card))', fillOpacity: 0.95 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
    };
  });
};

// ---------------------------------------------------------------------------
// Rollforward explanations. For each linkage, derive the actual math from the
// current + prior period so the user sees HOW the source line gets to the
// target line (NI alone does not equal Δ Retained Earnings — dividends and
// buybacks also hit RE, and the variance row makes that explicit).
// ---------------------------------------------------------------------------

// Each row: { label, value (signed), type, formula? }
//   type: 'begin' | 'add' | 'sub' | 'subtotal' | 'reported' | 'variance' | 'note'
const explainLinkage = (linkKey, statements, currentPeriod, priorPeriod) => {
  if (!statements || !currentPeriod) return null;

  const v = (stmt, id, period) => lookup(statements, stmt, id, period);

  switch (linkKey) {
    case 'is-net-income→bs-retained': {
      const rePrior = v('balance_sheet', 'bs-retained', priorPeriod);
      const ni      = v('income_statement', 'is-net-income', currentPeriod);
      const div     = v('cash_flow', 'cf-dividends', currentPeriod);
      const reCurr  = v('balance_sheet', 'bs-retained', currentPeriod);
      const divAbs  = div === null ? null : Math.abs(div);
      const canCompute = rePrior !== null && ni !== null;
      const computed = canCompute ? rePrior + ni - (divAbs ?? 0) : null;
      const variance = computed !== null && reCurr !== null ? reCurr - computed : null;
      return {
        title: 'Retained Earnings Rollforward',
        formula: 'RE_end = RE_begin + Net Income − Dividends − Treasury/Other',
        rows: [
          { label: `RE (${priorPeriod || 'prior period'})`, value: rePrior, type: 'begin' },
          { label: 'Net Income',                            value: ni,      type: 'add' },
          { label: 'Dividends declared',                    value: divAbs === null ? null : -divAbs, type: 'sub' },
          { label: 'Computed ending RE',                    value: computed, type: 'subtotal' },
          { label: `Reported ending RE (${currentPeriod})`, value: reCurr,  type: 'reported' },
          ...(variance !== null && Math.abs(variance) > 0.5
            ? [{ label: 'Variance — treasury stock retirement / other equity activity', value: variance, type: 'variance' }]
            : []),
        ],
        note:
          'Net Income flows to RE, but so do dividends (out) and buybacks classified as treasury-stock retirement (out). ' +
          'For aggressive buyback issuers like AAPL the variance can be larger than NI itself — that residual is the buyback charge to RE.',
      };
    }

    case 'is-net-income→cf-net-income': {
      const ni    = v('income_statement', 'is-net-income', currentPeriod);
      const cfNi  = v('cash_flow', 'cf-net-income', currentPeriod);
      return {
        title: 'NI → Operating CF starting line',
        formula: 'CF_Op begins with Net Income',
        rows: [
          { label: 'IS — Net Income',              value: ni,   type: 'reported' },
          { label: 'CF — Net Income (start line)', value: cfNi, type: 'reported' },
          ...(ni !== null && cfNi !== null
            ? [{ label: 'Variance', value: cfNi - ni, type: 'variance' }]
            : []),
        ],
        note: 'Operating cash flow always starts with NI, then adjusts for non-cash items and Δ working capital. The two figures should be identical (any variance is a label-match miss).',
      };
    }

    case 'is-depreciation→cf-depreciation': {
      const isDa = v('income_statement', 'is-depreciation', currentPeriod);
      const cfDa = v('cash_flow', 'cf-depreciation', currentPeriod);
      return {
        title: 'D&A — non-cash add-back',
        formula: 'CF adds D&A back because it reduced IS earnings without moving cash',
        rows: [
          { label: 'IS — Depreciation & Amort.',     value: isDa, type: 'reported' },
          { label: 'CF — D&A add-back',              value: cfDa, type: 'reported' },
        ],
        note: 'IS often buries D&A inside COGS or Opex (no standalone line) — in that case "IS — D&A" reads "—" and the CF figure is the canonical total.',
      };
    }

    case 'is-tax→bs-taxes-payable': {
      const tax    = v('income_statement', 'is-tax', currentPeriod);
      const tpPrior = v('balance_sheet', 'bs-taxes-payable', priorPeriod);
      const tpCurr  = v('balance_sheet', 'bs-taxes-payable', currentPeriod);
      const deltaTp = tpCurr !== null && tpPrior !== null ? tpCurr - tpPrior : null;
      return {
        title: 'Tax Expense ↔ Taxes Payable',
        formula: 'Δ Taxes Payable = Tax Expense − Taxes Paid (cash)',
        rows: [
          { label: 'IS — Income Tax Expense (accrual)', value: tax,    type: 'reported' },
          { label: `Taxes Payable (${priorPeriod || 'prior'})`, value: tpPrior, type: 'begin' },
          { label: `Taxes Payable (${currentPeriod})`,  value: tpCurr, type: 'reported' },
          { label: 'Δ Taxes Payable',                   value: deltaTp, type: 'subtotal' },
        ],
        note: 'Tax expense on the IS is accrual-based. The BS Taxes Payable balance only moves by the difference between tax expense and taxes actually paid in cash that period.',
      };
    }

    case 'is-tax→cf-deferred-tax': {
      const tax = v('income_statement', 'is-tax', currentPeriod);
      const dt  = v('cash_flow', 'cf-deferred-tax', currentPeriod);
      return {
        title: 'Deferred Tax Portion',
        formula: 'Deferred Tax = Tax Expense (book) − Current Tax (cash)',
        rows: [
          { label: 'IS — Total Tax Expense',     value: tax, type: 'reported' },
          { label: 'CF — Deferred Tax add-back', value: dt,  type: 'reported' },
        ],
        note: 'The deferred-tax line on the CF reconciles book tax (IS) to cash tax. A positive deferred-tax add-back means book tax exceeded cash tax that period.',
      };
    }

    case 'bs-ar→cf-change-ar': {
      const arPrior = v('balance_sheet', 'bs-ar', priorPeriod);
      const arCurr  = v('balance_sheet', 'bs-ar', currentPeriod);
      const cfDelta = v('cash_flow', 'cf-change-ar', currentPeriod);
      const delta   = arCurr !== null && arPrior !== null ? -(arCurr - arPrior) : null;
      return {
        title: 'Δ Accounts Receivable',
        formula: 'CF adjustment = −(AR_end − AR_begin)',
        rows: [
          { label: `AR (${priorPeriod || 'prior'})`, value: arPrior, type: 'begin' },
          { label: `AR (${currentPeriod})`,          value: arCurr,  type: 'reported' },
          { label: 'Computed cash impact',           value: delta,   type: 'subtotal' },
          { label: 'CF — reported adjustment',       value: cfDelta, type: 'reported' },
          ...(delta !== null && cfDelta !== null && Math.abs(delta - cfDelta) > 0.5
            ? [{ label: 'Variance — FX / acquisitions / write-offs', value: cfDelta - delta, type: 'variance' }]
            : []),
        ],
        note: 'Rising AR = cash trapped in receivables → negative CF adjustment. Variance from the BS delta is typically FX translation, acquired/divested AR, or write-offs.',
      };
    }

    case 'bs-inventory→cf-change-inv': {
      const ivPrior = v('balance_sheet', 'bs-inventory', priorPeriod);
      const ivCurr  = v('balance_sheet', 'bs-inventory', currentPeriod);
      const cfDelta = v('cash_flow', 'cf-change-inv', currentPeriod);
      const delta   = ivCurr !== null && ivPrior !== null ? -(ivCurr - ivPrior) : null;
      return {
        title: 'Δ Inventory',
        formula: 'CF adjustment = −(Inv_end − Inv_begin)',
        rows: [
          { label: `Inventory (${priorPeriod || 'prior'})`, value: ivPrior, type: 'begin' },
          { label: `Inventory (${currentPeriod})`,          value: ivCurr,  type: 'reported' },
          { label: 'Computed cash impact',                  value: delta,   type: 'subtotal' },
          { label: 'CF — reported adjustment',              value: cfDelta, type: 'reported' },
        ],
        note: 'Inventory build = cash spent on goods not yet sold → negative CF adjustment.',
      };
    }

    case 'bs-ap→cf-change-ap': {
      const apPrior = v('balance_sheet', 'bs-ap', priorPeriod);
      const apCurr  = v('balance_sheet', 'bs-ap', currentPeriod);
      const cfDelta = v('cash_flow', 'cf-change-ap', currentPeriod);
      const delta   = apCurr !== null && apPrior !== null ? apCurr - apPrior : null;
      return {
        title: 'Δ Accounts Payable',
        formula: 'CF adjustment = +(AP_end − AP_begin)',
        rows: [
          { label: `AP (${priorPeriod || 'prior'})`, value: apPrior, type: 'begin' },
          { label: `AP (${currentPeriod})`,          value: apCurr,  type: 'reported' },
          { label: 'Computed cash impact',           value: delta,   type: 'subtotal' },
          { label: 'CF — reported adjustment',       value: cfDelta, type: 'reported' },
        ],
        note: 'Rising AP = supplier float, deferring cash outflow → positive CF adjustment.',
      };
    }

    case 'bs-ppe→cf-capex': {
      const pPrior  = v('balance_sheet', 'bs-ppe', priorPeriod);
      const pCurr   = v('balance_sheet', 'bs-ppe', currentPeriod);
      const da      = v('cash_flow', 'cf-depreciation', currentPeriod);
      const capex   = v('cash_flow', 'cf-capex', currentPeriod);
      const capexAbs = capex === null ? null : Math.abs(capex);
      const implied = pCurr !== null && pPrior !== null && da !== null
        ? (pCurr - pPrior) + da
        : null;
      return {
        title: 'PP&E Rollforward',
        formula: 'PP&E_end = PP&E_begin + CapEx − D&A − Dispositions',
        rows: [
          { label: `PP&E net (${priorPeriod || 'prior'})`, value: pPrior, type: 'begin' },
          { label: `PP&E net (${currentPeriod})`,          value: pCurr,  type: 'reported' },
          { label: 'CF — D&A',                             value: da,     type: 'sub' },
          { label: 'Implied CapEx (Δ PP&E + D&A)',         value: implied, type: 'subtotal' },
          { label: 'CF — reported CapEx',                  value: capexAbs, type: 'reported' },
          ...(implied !== null && capexAbs !== null && Math.abs(implied - capexAbs) > 0.5
            ? [{ label: 'Variance — asset dispositions / impairments / FX', value: capexAbs - implied, type: 'variance' }]
            : []),
        ],
        note: 'Net PP&E grows by CapEx and shrinks by D&A. Variance from reported CapEx is typically dispositions, write-downs, or acquired/divested PP&E.',
      };
    }

    case 'bs-debt→cf-debt-issue': {
      const dPrior = v('balance_sheet', 'bs-debt', priorPeriod);
      const dCurr  = v('balance_sheet', 'bs-debt', currentPeriod);
      const cfNet  = v('cash_flow', 'cf-debt-issue', currentPeriod);
      const delta  = dCurr !== null && dPrior !== null ? dCurr - dPrior : null;
      return {
        title: 'Δ Long-Term Debt',
        formula: 'Δ LT Debt = Issuance − Repayments',
        rows: [
          { label: `LT Debt (${priorPeriod || 'prior'})`, value: dPrior, type: 'begin' },
          { label: `LT Debt (${currentPeriod})`,          value: dCurr,  type: 'reported' },
          { label: 'Δ on BS',                             value: delta,  type: 'subtotal' },
          { label: 'CF — first matched debt line',        value: cfNet,  type: 'reported' },
        ],
        note: 'CF reports issuance and repayment as separate lines; this view picks the first match. Variance from BS Δ is the offsetting line plus current-portion reclasses.',
      };
    }

    case 'bs-common-stock→cf-equity-issue': {
      const csPrior = v('balance_sheet', 'bs-common-stock', priorPeriod);
      const csCurr  = v('balance_sheet', 'bs-common-stock', currentPeriod);
      const cfEq    = v('cash_flow', 'cf-equity-issue', currentPeriod);
      const delta   = csCurr !== null && csPrior !== null ? csCurr - csPrior : null;
      return {
        title: 'Δ Common Stock / APIC',
        formula: 'Δ Equity (par + APIC) = Issuance − Buybacks',
        rows: [
          { label: `Common Stock + APIC (${priorPeriod || 'prior'})`, value: csPrior, type: 'begin' },
          { label: `Common Stock + APIC (${currentPeriod})`,           value: csCurr,  type: 'reported' },
          { label: 'Δ on BS',                                          value: delta,   type: 'subtotal' },
          { label: 'CF — first matched equity line',                   value: cfEq,    type: 'reported' },
        ],
        note: 'Buybacks classified as treasury stock retirement go through this account; otherwise they land in Treasury Stock with the equity offset hitting RE.',
      };
    }

    case 'cf-net-change→bs-cash': {
      const cashPrior = v('balance_sheet', 'bs-cash', priorPeriod);
      const cashCurr  = v('balance_sheet', 'bs-cash', currentPeriod);
      const op   = v('cash_flow', 'cf-operating', currentPeriod);
      const inv  = v('cash_flow', 'cf-investing', currentPeriod);
      const fin  = v('cash_flow', 'cf-financing', currentPeriod);
      const sumCf = [op, inv, fin].every((n) => n !== null) ? op + inv + fin : null;
      const computed = cashPrior !== null && sumCf !== null ? cashPrior + sumCf : null;
      const variance = computed !== null && cashCurr !== null ? cashCurr - computed : null;
      return {
        title: 'Cash Rollforward',
        formula: 'Cash_end = Cash_begin + CF_Op + CF_Inv + CF_Fin (+ FX)',
        rows: [
          { label: `Cash (${priorPeriod || 'prior'})`, value: cashPrior, type: 'begin' },
          { label: 'Operating CF',                     value: op,        type: 'add' },
          { label: 'Investing CF',                     value: inv,       type: 'add' },
          { label: 'Financing CF',                     value: fin,       type: 'add' },
          { label: 'Computed ending cash',             value: computed,  type: 'subtotal' },
          { label: `Reported ending cash (${currentPeriod})`, value: cashCurr, type: 'reported' },
          ...(variance !== null && Math.abs(variance) > 0.5
            ? [{ label: 'Variance — FX translation effect', value: variance, type: 'variance' }]
            : []),
        ],
        note: 'The three CF sections sum to Δ Cash on the BS. Residual is the FX translation effect for issuers with foreign operations.',
      };
    }

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Overlays — legend, help pill, "no data" hint, and the rollforward panel.
// ---------------------------------------------------------------------------

const Legend = () => (
  <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 rounded-lg border border-border bg-card/95 p-2.5 backdrop-blur-sm text-xs">
    <div className="font-semibold text-foreground mb-0.5">Linkages</div>
    <div className="flex items-center gap-2"><span className="h-0.5 w-6 bg-accent rounded" /><span className="text-muted-foreground">Income → Equity / CF</span></div>
    <div className="flex items-center gap-2"><span className="h-0.5 w-6 bg-gain rounded" /><span className="text-muted-foreground">Working capital ⇄ Operating CF</span></div>
    <div className="flex items-center gap-2"><span className="h-0.5 w-6 bg-loss rounded" /><span className="text-muted-foreground">Investing / Financing</span></div>
  </div>
);

const HelpPill = () => (
  <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 backdrop-blur-sm text-xs text-muted-foreground">
    <IconHandStop size={14} />
    Drag statements anywhere · scroll to zoom · use the controls to fit the view
  </div>
);

const RollforwardPanel = ({ explanation, onClose, units }) => {
  if (!explanation) return null;
  const fmt = (n) => (n === null || n === undefined) ? '—' : formatCurrency(n, units);
  const signedFmt = (n) => {
    if (n === null || n === undefined) return '—';
    const s = formatCurrency(Math.abs(n), units);
    return n < 0 ? `(${s})` : s;
  };

  return (
    <div className="absolute top-3 right-3 z-20 w-[380px] max-h-[calc(100%-24px)] flex flex-col rounded-lg border border-border bg-card shadow-xl overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border bg-card-hover/40">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-accent mb-0.5">Rollforward</div>
          <div className="text-sm font-semibold leading-tight">{explanation.title}</div>
          {explanation.formula && (
            <div className="text-[11px] text-muted-foreground mt-1 font-mono leading-snug">{explanation.formula}</div>
          )}
        </div>
        <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground shrink-0">
          <IconX size={16} />
        </button>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-xs">
          <tbody>
            {explanation.rows.map((row, i) => {
              const rowCls = cn(
                'border-b border-border/40 last:border-b-0',
                row.type === 'subtotal' && 'font-medium border-t border-t-border/60',
                row.type === 'reported' && 'font-semibold',
                row.type === 'variance' && 'bg-loss/10 text-loss font-medium',
                row.type === 'begin' && 'text-muted-foreground'
              );
              const prefix = row.type === 'add' ? '+' : row.type === 'sub' ? '−' : '';
              const valueStr = row.type === 'variance'
                ? signedFmt(row.value)
                : (prefix && row.value !== null ? `${prefix} ${fmt(row.value === null ? null : Math.abs(row.value))}` : fmt(row.value));
              return (
                <tr key={i} className={rowCls}>
                  <td className="px-4 py-2 leading-snug">{row.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{valueStr}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {explanation.note && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-[11px] leading-snug text-muted-foreground">
          {explanation.note}
        </div>
      )}
    </div>
  );
};

const NoDataHint = () => (
  <div className="absolute top-3 left-3 z-10 flex items-start gap-2 rounded-lg border border-border bg-card/95 p-3 backdrop-blur-sm text-xs max-w-xs">
    <IconInfoCircle size={14} className="text-accent shrink-0 mt-0.5" />
    <div>
      <div className="font-semibold text-foreground">Showing canonical structure</div>
      <div className="text-muted-foreground mt-0.5">
        Load a ticker via <strong>Search setup</strong> in the left rail to populate every line item with the company's
        actual numbers and dollar-magnitude edge labels.
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Main component. Re-derives node items + edges whenever the selected
// company/period/units change, while preserving user-dragged positions.
// ---------------------------------------------------------------------------

const LinkageDiagram = ({ data, ticker }) => {
  const units = useUnits();

  const companies = data?.companies || [];
  const [activeCik, setActiveCik] = useState(null);

  // Snap the active company back to the first loaded one whenever the
  // loaded set changes (new search, ticker added/removed).
  const cikKey = companies.map((c) => c?.company?.cik).join('|');
  useEffect(() => {
    const first = companies[0]?.company?.cik || null;
    setActiveCik(first);
  }, [cikKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const company =
    companies.find((c) => c?.company?.cik === activeCik) ||
    companies[0] ||
    null;

  const periods = useMemo(() => {
    const ys = company?.years ? [...company.years] : [];
    // Sort descending so the latest period is the default.
    return ys.sort((a, b) => String(b).localeCompare(String(a)));
  }, [company]);

  const [period, setPeriod] = useState(periods[0] || null);
  const [selectedLinkKey, setSelectedLinkKey] = useState(null);

  // When the underlying company or its periods change, snap selection back
  // to the latest available period.
  useEffect(() => {
    setPeriod(periods[0] || null);
  }, [periods.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const priorPeriod = useMemo(() => {
    if (!period) return null;
    const idx = periods.indexOf(period);
    return idx >= 0 ? periods[idx + 1] || null : null;
  }, [period, periods]);

  const populatedNodes = useMemo(
    () =>
      INITIAL_NODES.map((node) => {
        const baseItems = node.id === 'IS' ? IS_ITEMS : node.id === 'BS' ? BS_ITEMS : CF_ITEMS;
        return {
          ...node,
          data: {
            ...node.data,
            items: buildItems(node.id, baseItems, company?.statements, period, units),
          },
        };
      }),
    [company, period, units]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(populatedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges(populatedNodes, null));

  // When data/period/units/selection change, refresh each node's data and
  // rebuild edges (so the selected edge gets its highlight) while preserving
  // the user's dragged positions.
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const next = populatedNodes.find((p) => p.id === n.id);
        return next ? { ...n, data: next.data } : n;
      })
    );
    setEdges(buildEdges(populatedNodes, selectedLinkKey));
  }, [populatedNodes, selectedLinkKey, setNodes, setEdges]);

  const handleEdgeClick = useCallback((_e, edge) => {
    const key = edge?.data?.linkKey;
    if (!key) return;
    setSelectedLinkKey((prev) => (prev === key ? null : key));
  }, []);

  const handlePaneClick = useCallback(() => setSelectedLinkKey(null), []);

  const explanation = useMemo(
    () => explainLinkage(selectedLinkKey, company?.statements, period, priorPeriod),
    [selectedLinkKey, company, period, priorPeriod]
  );

  const resetLayout = useCallback(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const init = INITIAL_NODES.find((i) => i.id === n.id);
        return init ? { ...n, position: { ...init.position } } : n;
      })
    );
  }, [setNodes]);

  const memoTypes = useMemo(() => nodeTypes, []);
  const hasData = Boolean(company && period);

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <IconGitMerge size={20} className="text-accent" />
          <h3 className="text-lg font-semibold">Three-Statement Linkages</h3>
          {hasData && (
            <span className="text-sm text-muted-foreground">
              · {company?.company?.ticker || ticker || company?.company?.name} {period && <>· {period}</>}
            </span>
          )}
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
        <div className="flex items-center gap-2">
          {periods.length > 1 && (
            <Select value={period || ''} onValueChange={(v) => v && setPeriod(v)}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={resetLayout}>
            <IconRefresh size={14} />
            Reset layout
          </Button>
        </div>
      </div>

      <div className="relative h-[calc(100vh-260px)] min-h-[560px] rounded-lg border border-border overflow-hidden bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={memoTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={1.8}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          colorMode="dark"
        >
          <Background color="hsl(var(--border))" gap={24} size={1} />
          <Controls
            className="!bg-card !border !border-border [&_button]:!bg-card [&_button]:!border-border [&_button]:!text-foreground hover:[&_button]:!bg-card-hover"
            showInteractive={false}
          />
          <MiniMap
            className="!bg-card !border !border-border"
            nodeColor="hsl(var(--card-hover))"
            nodeStrokeColor="hsl(var(--accent))"
            maskColor="hsl(var(--background) / 0.6)"
            pannable
            zoomable
          />
        </ReactFlow>
        {!explanation && <Legend />}
        <HelpPill />
        {!hasData && !explanation && <NoDataHint />}
        {explanation && (
          <RollforwardPanel
            explanation={explanation}
            onClose={() => setSelectedLinkKey(null)}
            units={units}
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        {hasData ? (
          <>
            Showing <strong>{ticker || company?.company?.name}</strong> for <strong>{period}</strong>
            {priorPeriod && <> (rollforwards vs <strong>{priorPeriod}</strong>)</>}. Values are pulled from the loaded
            statements; <strong>click any edge</strong> to open the rollforward math behind it. Cells reading "—" mean
            the company didn't report that line under a recognized label.
          </>
        ) : (
          <>
            Canonical 3-statement linkages — NI closes Retained Earnings on the BS, starts Operating CF, and D&A is
            added back as non-cash. Δ working-capital items reconcile BS movements into Operating CF. Δ PP&E + D&A = CapEx.
            Δ debt and equity become Financing CF. Σ of all three CF sections is the change in Cash on the BS.
          </>
        )}
      </p>
    </div>
  );
};

export default LinkageDiagram;
