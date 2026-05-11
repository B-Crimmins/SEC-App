import React, { useMemo } from 'react';
import MultiSelect from './MultiSelect';
import { useDistinct } from './useDistinct';
import s from './BankingSector.module.css';

// Per-card multi-select for a single dimension column (e.g. `category`,
// `NM_LGL`). Distinct values are scoped by `scopeFilters` so the dropdown
// only shows values that exist for the active tab + any other per-card
// selections. Used for the pickers that belong to a chart's spec, not the
// global sidebar.
export default function ScopeShelf({
  column,
  label,
  required = false,
  value,
  onChange,
  scopeFilters,
  placeholder,
}) {
  // Strip this column from its own scope so the dropdown doesn't hide
  // currently selected values when the user is trying to add more.
  const scoped = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(scopeFilters || {})) {
      if (k !== column && Array.isArray(v) && v.length) out[k] = v;
    }
    return out;
  }, [scopeFilters, column]);

  const { values, loading } = useDistinct(column, scoped);

  const unmet = required && value.length === 0;
  const computedPlaceholder =
    placeholder || (loading
      ? 'Loading…'
      : `${label.toLowerCase()} (${(values?.length || 0).toLocaleString()} available)`);

  return (
    <div className={`${s.shelf} ${unmet ? s.shelfRequired : ''}`}>
      <div className={s.shelfLabel}>
        {label}
        {required && <span className={s.required}> *</span>}
      </div>
      <div className={`${s.shelfBody} ${s.scopeShelfBody}`}>
        <MultiSelect
          value={value}
          onChange={onChange}
          options={values || []}
          placeholder={computedPlaceholder}
        />
      </div>
    </div>
  );
}
