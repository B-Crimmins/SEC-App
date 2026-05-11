import React, { useState } from 'react';
import s from './BankingSector.module.css';

// Horizontal list of dimension pills. Click the + to append another dim from
// the allowlist; click a pill's × to remove it.
export default function DimensionShelf({ value, onChange, options, label = 'Dimensions' }) {
  const [picking, setPicking] = useState(false);

  const remaining = options.filter((c) => !value.includes(c));

  return (
    <div className={s.shelf}>
      <div className={s.shelfLabel}>{label}</div>
      <div className={s.shelfBody}>
        {value.map((dim) => (
          <span key={dim} className={s.pillDim}>
            <span className={s.pillText}>{dim}</span>
            <button
              type="button"
              className={s.pillRemove}
              onClick={() => onChange(value.filter((d) => d !== dim))}
            >×</button>
          </span>
        ))}
        {remaining.length > 0 && (
          <div className={s.pillAddWrap}>
            <button
              type="button"
              className={s.pillAdd}
              onClick={() => setPicking((p) => !p)}
            >+ dim</button>
            {picking && (
              <div className={s.pillAddMenu}>
                {remaining.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={s.pillAddMenuItem}
                    onClick={() => { onChange([...value, opt]); setPicking(false); }}
                  >{opt}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
