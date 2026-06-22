import React from 'react';
import s from './statements.module.css';
import { useUnits } from '../../../Utilities/UnitsContext';
import { formatCurrency, formatPerShare } from '../../../Utilities/formatters';

const STATEMENT_TITLES = {
  balance_sheet: 'Balance Sheet',
  income_statement: 'Income Statement',
  cash_flow: 'Cash Flow Statement',
};

// Renders one statement (or all three, if no statementType is given) as a single
// flat table per company. Per-category sub-headers are collapsed into section
// rows so the table reads top-to-bottom without separate Paper cards.
const FinancialStatementViewer = ({ data, statementType }) => {
  const unit = useUnits();
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

  return (
    <div className={s.stack} style={{ paddingTop: 16 }}>
      {data.companies.map((company) => {
        const years = company.years || [];
        const showStatementHeader = statementsToRender.length > 1;

        return (
          <div key={company.company.cik} className={s.stack}>
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
        );
      })}
    </div>
  );
};

export default FinancialStatementViewer;
