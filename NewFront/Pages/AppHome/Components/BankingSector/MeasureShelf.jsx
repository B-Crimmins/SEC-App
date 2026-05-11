import React, { useState } from 'react';
import s from './BankingSector.module.css';

// Measure pill: {column, agg, alias}. Alias auto-derives from "<agg>_<col>"
// unless explicitly set. Each pill has inline selects for column and agg
// plus a × to remove.
function aliasFor(m) {
  return m.alias || `${m.agg}_${m.column}`;
}

export default function MeasureShelf({
  value,
  onChange,
  measureColumns,
  aggregations,
  label = 'Measures',
}) {
  const [picking, setPicking] = useState(false);

  const addMeasure = (agg) => {
    const col = measureColumns[0];
    onChange([...value, { column: col, agg, alias: `${agg}_${col}` }]);
    setPicking(false);
  };

  const update = (idx, patch) => {
    onChange(
      value.map((m, i) => {
        if (i !== idx) return m;
        const next = { ...m, ...patch };
        // Regenerate alias automatically unless the user has typed a custom one.
        if ((patch.column || patch.agg) && (!m.alias || m.alias === aliasFor(m))) {
          next.alias = `${next.agg}_${next.column}`;
        }
        return next;
      })
    );
  };

  const remove = (idx) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className={s.shelf}>
      <div className={s.shelfLabel}>{label}</div>
      <div className={s.shelfBody}>
        {value.map((m, i) => (
          <span key={i} className={s.pillMeasure}>
            <select
              className={s.pillSelect}
              value={m.agg}
              onChange={(e) => update(i, { agg: e.target.value })}
            >
              {aggregations.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className={s.pillSep}>(</span>
            <select
              className={s.pillSelect}
              value={m.column}
              onChange={(e) => update(i, { column: e.target.value })}
            >
              {measureColumns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className={s.pillSep}>)</span>
            <button type="button" className={s.pillRemove} onClick={() => remove(i)}>×</button>
          </span>
        ))}
        <div className={s.pillAddWrap}>
          <button
            type="button"
            className={s.pillAdd}
            onClick={() => setPicking((p) => !p)}
          >+ measure</button>
          {picking && (
            <div className={s.pillAddMenu}>
              {aggregations.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={s.pillAddMenuItem}
                  onClick={() => addMeasure(a)}
                >{a}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
