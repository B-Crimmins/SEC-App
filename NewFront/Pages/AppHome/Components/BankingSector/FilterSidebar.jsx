import React, { useEffect, useMemo } from 'react';
import MultiSelect from './MultiSelect';
import { useDistinct } from './useDistinct';
import { comparePeriods, formatPeriod } from './metricMap';
import s from './BankingSector.module.css';

// Global filters only — values that should apply uniformly across every
// card. `risk_type` lives on the top tabs; `NM_LGL` and `category` live on
// each chart card (so the user can mix different entities/categories on
// different charts in the same dashboard).
const DIMENSIONS = [
  { column: 'reporting_period',  label: 'Reporting periods', placeholder: 'All periods' },
  { column: 'statement_bucket',  label: 'Statement bucket',  placeholder: 'All' },
  { column: 'detail',            label: 'Detail',            placeholder: 'All' },
  { column: 'measurement_type',  label: 'Measurement type',  placeholder: 'All' },
];

// Distinct values for one dim, scoped by every OTHER active filter PLUS the
// forced filters set by the top-level tabs (e.g. the current risk_type).
// Keeps the dropdowns honest — switching to a different risk tab immediately
// restricts every dropdown to values that actually exist for that risk type.
function FilterField({ dim, filters, setFilters, forcedFilters }) {
  const scoped = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(forcedFilters || {})) {
      if (k !== dim.column && Array.isArray(v) && v.length) out[k] = v;
    }
    for (const [k, v] of Object.entries(filters || {})) {
      if (k !== dim.column && Array.isArray(v) && v.length) out[k] = v;
    }
    return out;
  }, [filters, forcedFilters, dim.column]);
  const { values, loading } = useDistinct(dim.column, scoped);

  // BigQuery returns reporting_period sorted lexicographically — resort
  // chronologically so dropdowns read oldest-to-newest like a time series.
  const options = useMemo(() => {
    if (dim.column === 'reporting_period') {
      const sorted = [...(values || [])].sort(comparePeriods);
      return sorted.map((v) => ({ value: v, label: formatPeriod(v) }));
    }
    return values || [];
  }, [values, dim.column]);

  const current = filters[dim.column] || [];

  // When the allowed values shrink (e.g. after switching tabs), drop any
  // previously-selected chips that are no longer reachable. Skip while a
  // distinct query is in flight so we don't prune against stale data.
  useEffect(() => {
    if (loading) return;
    if (!current.length || !values) return;
    const allowed = new Set(values);
    const next = current.filter((v) => allowed.has(v));
    if (next.length !== current.length) {
      setFilters((f) => ({ ...f, [dim.column]: next }));
    }
  }, [values, loading]);

  return (
    <div className={s.field}>
      <div className={s.fieldLabel}>
        <span>{dim.label}</span>
        <span>{loading ? '…' : (values?.length?.toLocaleString() || '0')}</span>
      </div>
      <MultiSelect
        value={current}
        onChange={(v) => setFilters((f) => ({ ...f, [dim.column]: v }))}
        options={options}
        placeholder={dim.placeholder}
      />
    </div>
  );
}

export default function FilterSidebar({ filters, setFilters, onReset, forcedFilters }) {
  return (
    <aside className={s.sidebar}>
      <h3 className={s.sidebarTitle}>Filters</h3>
      {DIMENSIONS.map((d) => (
        <FilterField
          key={d.column}
          dim={d}
          filters={filters}
          setFilters={setFilters}
          forcedFilters={forcedFilters}
        />
      ))}
      <button type="button" className={s.resetBtn} onClick={onReset}>Reset filters</button>
    </aside>
  );
}
