import React from 'react';
import Popover from './Popover';
import s from './statements.module.css';
import { useUnits } from '../../../Utilities/UnitsContext';
import { formatCurrency } from '../../../Utilities/formatters';

// Ratio keys whose value is a raw dollar amount (not a multiple or
// percentage). These get reformatted on the frontend so they respect the
// global Millions/Billions toggle from Preferences instead of using the
// hardcoded "$X.XXM" string the backend produces.
const DOLLAR_VALUE_RATIOS = new Set(['revenue', 'free_cash_flow']);

// Ratios where a lower value is the "good" outcome (leverage, plant age, cost/burden
// ratios). Color coding inverts for these: a negative YoY delta is green, positive red.
const RATIO_YOY_INVERTED = new Set([
  'debt_to_equity',
  'debt_to_total_capitalization',
  'total_assets_to_equity',
  'average_age_of_plant',
  'sga_percent_of_revenue',
  'effective_tax_rate',
]);

const yoyClass = (ratioKey, delta) => {
  if (typeof delta !== 'number' || delta === 0) return '';
  const inverted = RATIO_YOY_INVERTED.has(ratioKey);
  const isGood = inverted ? delta < 0 : delta > 0;
  return isGood ? s.deltaUp : s.deltaDown;
};

const RATIO_LABELS = {
  net_working_capital_ratio: 'Net Working Capital Ratio',
  current_ratio: 'Current Ratio',
  quick_ratio: 'Quick Ratio',
  cash_ratio: 'Cash Ratio',
  debt_to_equity: 'Debt to Equity',
  debt_to_total_capitalization: 'Debt to Total Capitalization',
  total_assets_to_equity: 'Total Assets / Equity',
  book_value: 'Book Value',
  tangible_book_value: 'Tangible Book Value',
  average_age_of_plant: 'Average Age of Plant',
  average_remaining_life_of_plant: 'Average Remaining Life of Plant',
  average_total_life_span_of_plant: 'Average Total Life Span of Plant',
  inventory_turnover: 'Inventory Turnover',
  receivables_turnover: 'Receivables Turnover',
  operating_cash_flow_to_net_income: 'Operating Cash Flow / Net Income',
  capex_to_depreciation: 'CapEx / Depreciation',
  free_cash_flow: 'Free Cash Flow',
  revenue: 'Revenue',
  gross_profit_margin: 'Gross Profit Margin',
  operating_margin: 'Operating Margin',
  net_margin: 'Net Margin',
  ebitda_margin: 'EBITDA Margin',
  sga_percent_of_revenue: 'SG&A as % of Revenue',
  effective_tax_rate: 'Effective Tax Rate',
  roa: 'Return on Assets',
  roe: 'Return on Equity',
  roic: 'Return on Invested Capital',
  interest_coverage: 'Interest Coverage',
  earnings_per_share: 'Earnings Per Share',
};

// Section order and sub-grouping mirror the legacy one-pager layout:
// groups within a section render with a blank-row gap (no header),
// sections render with an underlined bold title row.
const SECTIONS = [
  {
    title: 'Liquidity Ratios',
    groups: [['net_working_capital_ratio', 'current_ratio', 'quick_ratio', 'cash_ratio']],
  },
  {
    title: 'Capital Ratios',
    groups: [
      ['debt_to_equity', 'debt_to_total_capitalization', 'total_assets_to_equity'],
      ['book_value', 'tangible_book_value'],
      ['average_age_of_plant', 'average_remaining_life_of_plant', 'average_total_life_span_of_plant'],
    ],
  },
  { title: 'Operating Ratios', groups: [['inventory_turnover', 'receivables_turnover']] },
  {
    title: 'Quality of Earnings Analysis',
    groups: [['operating_cash_flow_to_net_income', 'capex_to_depreciation', 'free_cash_flow']],
  },
  {
    title: 'Margins and Profitability',
    groups: [
      ['revenue', 'gross_profit_margin', 'operating_margin', 'net_margin', 'ebitda_margin', 'sga_percent_of_revenue', 'effective_tax_rate'],
      ['roa', 'roe', 'roic', 'interest_coverage', 'earnings_per_share'],
    ],
  },
];

const TooltipCell = ({ formatted, tooltip, hideYoy, ratioKey, nullReason, rowLabel }) => {
  if (!formatted) return '';
  // Structural N/A: the backend couldn't compute the ratio for a known
  // filer-schema reason (e.g. airlines don't report SG&A). Render "N/A"
  // with the explanation in a popover so the user understands why.
  if (nullReason) {
    const naContent = (
      <div className={s.stackSm}>
        <div className={s.popTitle}>{rowLabel || 'Not applicable'}</div>
        <div>{nullReason}</div>
      </div>
    );
    return (
      <Popover content={naContent}>
        <span className={s.popDim} style={{ fontStyle: 'italic' }}>N/A</span>
      </Popover>
    );
  }
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
            <span className={yoyClass(ratioKey, yoy.delta)}>
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
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} style={{ height: 12, flex: 1, background: 'hsl(var(--muted))', borderRadius: 4 }} />
    ))}
  </div>
);

const FinancialComparisonTable = ({ data, selectedTickers, loading }) => {
  const units = useUnits();
  if (loading && (!data || !data.calculated_ratios)) {
    return (
      <div className={s.stack} style={{ paddingTop: 16 }}>
        <h3 className={s.sectionLabel}>Ratio and Margin Analysis</h3>
        <div className={s.card}>
          <div className={s.stack}>
            {Array.from({ length: 14 }, (_, i) => <SkeletonRow key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data || !data.calculated_ratios) {
    return <h4 className={s.cardTitle} style={{ paddingTop: 16 }}>No data available. Please search first.</h4>;
  }

  const { peer_group_ratios } = data.calculated_ratios;
  if (!peer_group_ratios || Object.keys(peer_group_ratios).length === 0) {
    return <h4 className={s.cardTitle}>No ratio data found.</h4>;
  }

  const allCompanies = Object.entries(peer_group_ratios).map(([ticker, info]) => ({
    ticker,
    name: info.company_name,
    periods: info.periods,
  }));
  const companies = selectedTickers
    ? allCompanies.filter((company) => selectedTickers.includes(company.ticker))
    : allCompanies;

  if (companies.length === 0) return <h4 className={s.cardTitle}>No companies selected</h4>;

  const firstCompany = companies[0];
  const years = Object.keys(firstCompany.periods).sort((a, b) => b.localeCompare(a));
  if (years.length === 0) return <h4 className={s.cardTitle}>No periods available</h4>;

  const firstPeriod = years[0];
  const firstRatios = firstCompany.periods[firstPeriod]?.ratios || {};

  const getRatioEntry = (company, year, ratioKey) => {
    try { return company.periods[year]?.ratios[ratioKey] || null; }
    catch { return null; }
  };

  const hideYoy = companies.length > 1;
  const numDataCols = years.length * companies.length;
  const totalCols = 1 + numDataCols;
  const colWidth = numDataCols > 0 ? `${70 / numDataCols}%` : 'auto';

  const renderRatioRow = (ratioKey) => {
    const label = RATIO_LABELS[ratioKey] || firstRatios[ratioKey]?.label || ratioKey;
    const isDollarValue = DOLLAR_VALUE_RATIOS.has(ratioKey);
    return (
      <tr key={ratioKey}>
        <td className={s.label}>{label}</td>
        {years.map((year) =>
          companies.map((company) => {
            const entry = getRatioEntry(company, year, ratioKey);
            // Dollar-amount ratios are stored raw on the server; format
            // them through the unit-aware helper so the table matches the
            // M/B toggle from Preferences. Other ratios keep the backend's
            // string (percentages, multiples, etc.).
            const formatted = isDollarValue && typeof entry?.value === 'number'
              ? formatCurrency(entry.value, units)
              : (entry?.formatted || '');
            return (
              <td key={`${company.ticker}-${year}`} className={s.num}>
                <TooltipCell
                  formatted={formatted}
                  tooltip={entry?.tooltip}
                  hideYoy={hideYoy}
                  ratioKey={ratioKey}
                  nullReason={entry?.null_reason}
                  rowLabel={label}
                />
              </td>
            );
          })
        )}
      </tr>
    );
  };

  const allRows = [];
  SECTIONS.forEach((section, sectionIdx) => {
    allRows.push(
      <tr key={`section-${section.title}`} className={s.sectionRow}>
        <td colSpan={totalCols} style={{ paddingTop: sectionIdx === 0 ? 10 : 14 }}>
          {section.title}
        </td>
      </tr>
    );
    section.groups.forEach((group, groupIdx) => {
      if (groupIdx > 0) {
        allRows.push(
          <tr key={`spacer-${section.title}-${groupIdx}`} className={s.spacerRow}>
            <td colSpan={totalCols} />
          </tr>
        );
      }
      group.forEach((ratioKey) => allRows.push(renderRatioRow(ratioKey)));
    });
  });

  return (
    <div className={s.stack} style={{ paddingTop: 16 }}>
      <h3 className={s.sectionLabel}>Ratio and Margin Analysis</h3>
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
          <tbody>{allRows}</tbody>
        </table>
      </div>
    </div>
  );
};

export default FinancialComparisonTable;
