import React from 'react';
import Popover from './Popover';
import s from './statements.module.css';
import { useUnits } from '../../../Utilities/UnitsContext';
import { formatCurrency as sharedFormatCurrency } from '../../../Utilities/formatters';

// Ordered so rows read top-to-bottom like an income statement.
const ROW_ORDER = [
  'cost_of_goods_sold',
  'gross_margin',
  'sga',
  'research_and_development',
  'depreciation_amortization',
  'operating_expenses',
  'operating_margin',
  'pre_tax_margin',
  'effective_tax_rate',
  'net_margin',
  'ebit',
  'ebit_margin',
  'ebitda',
  'ebitda_margin',
  'adjusted_ebit',
];

const DOLLAR_KEYS = new Set(['ebit', 'ebitda', 'adjusted_ebit']);

// Cost / burden line items: a negative YoY delta is "good" (costs dropping),
// so we color it green. Everything else uses the default rule (up = green).
const YOY_INVERTED = new Set([
  'cost_of_goods_sold',
  'sga',
  'research_and_development',
  'depreciation_amortization',
  'operating_expenses',
  'effective_tax_rate',
]);

const yoyClass = (rowKey, delta) => {
  if (typeof delta !== 'number' || delta === 0) return '';
  const inverted = YOY_INVERTED.has(rowKey);
  const isGood = inverted ? delta < 0 : delta > 0;
  return isGood ? s.deltaUp : s.deltaDown;
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)}%`;
};

const TooltipCell = ({ formatted, tooltip, hideYoy, rowKey }) => {
  if (!formatted) return '';
  if (!tooltip) return formatted;

  const { label, formula, definition, components, yoy } = tooltip;
  const driver = yoy?.primary_driver;
  const showYoy = !hideYoy && yoy && typeof yoy.delta === 'number';

  const content = (
    <div className={s.stackSm}>
      <div className={s.popTitle}>{label}</div>
      {formula && <div className={s.popDim}><b>Formula:</b> {formula}</div>}
      {definition && <div>{definition}</div>}
      {Array.isArray(components) && components.length > 0 && (
        <div className={s.popDim}><b>Components:</b> {components.join(', ')}</div>
      )}
      {showYoy && (
        <>
          <div className={s.popDivider} />
          <div>
            <span style={{ fontWeight: 500 }}>YoY change: </span>
            <span className={yoyClass(rowKey, yoy.delta)}>
              {yoy.delta >= 0 ? '+' : ''}{yoy.delta.toFixed(2)}
              {typeof yoy.delta_pct === 'number'
                ? ` (${yoy.delta_pct >= 0 ? '+' : ''}${yoy.delta_pct.toFixed(1)}%)`
                : ''}
            </span>
          </div>
          {driver && (
            <div>
              <b>Primary driver:</b> {driver.component_label}
              {typeof driver.component_pct_change === 'number'
                ? ` (${driver.component_pct_change >= 0 ? '+' : ''}${driver.component_pct_change.toFixed(1)}%)`
                : ''}
            </div>
          )}
        </>
      )}
    </div>
  );

  return <Popover content={content}>{formatted}</Popover>;
};

const SkeletonRow = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        style={{
          height: 12,
          flex: 1,
          background: 'hsl(var(--muted))',
          borderRadius: 4,
        }}
      />
    ))}
  </div>
);

// formatCurrency lives inside the component (so it can read the Units
// context), so anything outside the component that needs dollar formatting
// has to take it as a parameter instead of grabbing it from outer scope.
const cellFor = (company, year, rowKey, formatCurrency) => {
  const row = company?.periods?.[year]?.ratios?.[rowKey];
  if (!row) return { formatted: '—', tooltip: null };
  const formatted =
    row.value === null || row.value === undefined
      ? '—'
      : DOLLAR_KEYS.has(rowKey)
        ? formatCurrency(row.value)
        : formatPercent(row.value);
  return { formatted, tooltip: row.tooltip || null };
};

const CommonSize = ({ data, loading }) => {
  const units = useUnits();
  const formatCurrency = (value) => sharedFormatCurrency(value, units);

  if (loading && (!data || !data.companies || data.companies.length === 0)) {
    return (
      <div className={s.stack} style={{ paddingTop: 16 }}>
        <h3 className={s.sectionLabel}>Common Size Analysis</h3>
        <div className={s.card}>
          <div className={s.stack}>
            {Array.from({ length: 12 }, (_, i) => <SkeletonRow key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data?.companies || data.companies.length === 0) {
    return (
      <div className={s.stack} style={{ paddingTop: 16 }}>
        <h4 className={s.cardTitle}>No common-size data available. Please search first.</h4>
      </div>
    );
  }

  const companies = data.companies;
  const years = (data.years && data.years.length > 0)
    ? [...data.years].sort((a, b) => b.localeCompare(a))
    : [];

  if (years.length === 0) {
    return (
      <div className={s.stack} style={{ paddingTop: 16 }}>
        <h3 className={s.sectionLabel}>Common Size</h3>
        <div className={s.dim}>No periods with extractable data.</div>
      </div>
    );
  }

  const labelLookup = {};
  for (const company of companies) {
    for (const year of years) {
      const ratios = company.periods?.[year]?.ratios;
      if (!ratios) continue;
      for (const key of ROW_ORDER) {
        if (!labelLookup[key] && ratios[key]?.label) {
          labelLookup[key] = ratios[key].label;
        }
      }
    }
  }

  const visibleRows = ROW_ORDER.filter((key) => labelLookup[key] !== undefined);
  // YoY attribution only makes sense for a single-ticker view.
  const hideYoy = companies.length > 1;
  const numDataCols = years.length * companies.length;
  const colWidth = numDataCols > 0 ? `${70 / numDataCols}%` : 'auto';

  return (
    <div className={s.stack} style={{ paddingTop: 16 }}>
      <h3 className={s.sectionLabel}>Common Size Analysis</h3>
      <div className={s.card} style={{ padding: 0, overflowX: 'auto' }}>
        <table className={s.table}>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Metric</th>
              {years.map((year) =>
                companies.map((company) => (
                  <th
                    key={`${company.ticker}-${year}`}
                    className={s.numHead}
                    style={{ width: colWidth }}
                  >
                    {company.ticker} {year}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((rowKey) => {
              const label = labelLookup[rowKey] || rowKey;
              return (
                <tr key={rowKey}>
                  <td className={s.label}>{label}</td>
                  {years.map((year) =>
                    companies.map((company) => {
                      const { formatted, tooltip } = cellFor(company, year, rowKey, formatCurrency);
                      return (
                        <td key={`${company.ticker}-${year}`} className={s.num}>
                          <TooltipCell
                            formatted={formatted}
                            tooltip={tooltip}
                            hideYoy={hideYoy}
                            rowKey={rowKey}
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CommonSize;
