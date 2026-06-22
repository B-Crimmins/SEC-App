import React, { useEffect, useState } from 'react';
import s from './statements.module.css';
import { useUnits } from '../../../Utilities/UnitsContext';
import { formatCurrency, formatPerShare } from '../../../Utilities/formatters';
import { cn } from '../../../src/lib/utils';

const STATEMENT_TITLES = {
  balance_sheet: 'Balance Sheet',
  income_statement: 'Income Statement',
  cash_flow: 'Cash Flow Statement',
};

// Renders one statement (or all three, if no statementType is given) for the
// currently-selected company. When more than one ticker is loaded a chip
// strip lets the user switch between them — raw statements don't line up
// well across filers, so we show them one-at-a-time rather than side-by-side.
const FinancialStatementViewer = ({ data, statementType }) => {
  const unit = useUnits();
  const [activeCik, setActiveCik] = useState(null);

  // Snap the active ticker back to the first one whenever the loaded set
  // changes (new search, ticker added/removed).
  const cikKey = (data?.companies || []).map((c) => c?.company?.cik).join('|');
  useEffect(() => {
    const first = data?.companies?.[0]?.company?.cik || null;
    setActiveCik(first);
  }, [cikKey]);

  if (!data?.companies || data.companies.length === 0) {
    return <div className={s.dim}>No data available</div>;
  }

  const statementsToRender = statementType
    ? [statementType]
    : ['balance_sheet', 'income_statement', 'cash_flow'];

  const renderStatementTable = (statementTitle, statementData, years, key, showStatementHeader) => {
    if (!statementData) return null;
    const categories = Object.keys(statementData);
    if (categories.length === 0) return null;

    const totalCols = 1 + years.length;
    const rows = [];

    if (showStatementHeader) {
      rows.push(
        <tr key={`stmt-${key}`} className={s.sectionRow}>
          <td colSpan={totalCols}>{statementTitle}</td>
        </tr>
      );
    }

    categories.forEach((category) => {
      const items = statementData[category];
      if (!items || items.length === 0) return;
      rows.push(
        <tr key={`cat-${key}-${category}`} className={s.subSectionRow}>
          <td colSpan={totalCols}>{category}</td>
        </tr>
      );
      items.forEach((item, idx) => {
        rows.push(
          <tr key={`row-${key}-${category}-${idx}`}>
            <td className={s.label}>{item.type}</td>
            {years.map((year) => (
              <td key={year} className={s.num}>
                {item.value_kind === 'per_share'
                  ? formatPerShare(item.values[year])
                  : formatCurrency(item.values[year], unit)}
              </td>
            ))}
          </tr>
        );
      });
    });

    return rows;
  };

  const companies = data.companies;
  // Resolve active company (fallback to first if the active CIK isn't in
  // the current set — happens for a single render frame after a refresh).
  const company = companies.find((c) => c?.company?.cik === activeCik) || companies[0];
  if (!company) return <div className={s.dim}>No data available</div>;

  const years = company.years || [];
  const showStatementHeader = statementsToRender.length > 1;

  return (
    <div className={s.stack} style={{ paddingTop: 16 }}>
      {/* Ticker switcher — only renders when more than one company is loaded. */}
      {companies.length > 1 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Ticker</span>
          {companies.map((c) => {
            const tk = c?.company?.ticker || c?.company?.cik;
            const isActive = c?.company?.cik === company?.company?.cik;
            return (
              <button
                key={c?.company?.cik}
                type="button"
                onClick={() => setActiveCik(c?.company?.cik)}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-semibold transition-colors',
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

      <div className={s.stack}>
        <div>
          <h2 className={s.sectionLabel}>{company.company.name}</h2>
          <div className={s.sectionSub}>CIK: {company.company.cik}</div>
        </div>
        <div className={s.card} style={{ padding: 0, overflowX: 'auto' }}>
          <table className={`${s.table} ${s.tableFixed}`}>
            <colgroup>
              {/* First column flexes for line-item labels; period columns
                  are pinned to a fixed width so headers and numeric body
                  cells share the exact same right edge. */}
              <col />
              {years.map((year) => (
                <col key={year} className={s.colNum} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Line Item</th>
                {years.map((year) => (
                  <th key={year} className={s.numHead}>{year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statementsToRender.flatMap((stmt) =>
                renderStatementTable(
                  STATEMENT_TITLES[stmt],
                  company.statements?.[stmt],
                  years,
                  stmt,
                  showStatementHeader
                ) || []
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FinancialStatementViewer;
