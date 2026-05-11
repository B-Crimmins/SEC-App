import { useEffect, useMemo, useRef, useState } from 'react';
import s from './BankingSector.module.css';

// Lightweight searchable multi-select. Options are either a list of strings or
// { value, label } objects. Renders at most VISIBLE_CAP matches; typing narrows
// the list. Keyboard: ArrowUp/Down/Enter/Esc/Backspace-to-remove-last-chip.
const VISIBLE_CAP = 300;

function norm(o) {
  return typeof o === 'string' ? { value: o, label: o } : o;
}

export default function MultiSelect({
  value,
  onChange,
  options,
  placeholder = 'Type to search',
  maxChipText = 28,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const normalized = useMemo(() => options.map(norm), [options]);
  const valueSet = useMemo(() => new Set(value), [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = q
      ? normalized.filter(o => o.label.toLowerCase().includes(q))
      : normalized;
    return arr.slice(0, VISIBLE_CAP);
  }, [normalized, query]);

  useEffect(() => { setActive(0); }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (v) => {
    if (valueSet.has(v)) onChange(value.filter(x => x !== v));
    else onChange([...value, v]);
  };

  const remove = (v) => onChange(value.filter(x => x !== v));

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      if (open && matches[active]) { e.preventDefault(); toggle(matches[active].value); }
    } else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Backspace' && !query && value.length) { remove(value[value.length - 1]); }
  };

  const labelFor = (v) => normalized.find(o => o.value === v)?.label ?? v;

  return (
    <div className={s.msRoot} ref={rootRef}>
      <div className={s.msControl} onClick={() => { inputRef.current?.focus(); setOpen(true); }}>
        {value.map(v => {
          const label = labelFor(v);
          const shown = label.length > maxChipText ? label.slice(0, maxChipText - 1) + '…' : label;
          return (
            <span key={v} className={s.msChip}>
              <span className={s.msChipText} title={label}>{shown}</span>
              <button
                type="button"
                className={s.msChipRemove}
                onMouseDown={(e) => { e.preventDefault(); remove(v); }}
                aria-label={`Remove ${label}`}
              >×</button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          className={s.msInput}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={value.length ? '' : placeholder}
        />
      </div>
      {open && (
        <div className={s.msDropdown} role="listbox">
          {normalized.length > VISIBLE_CAP && (
            <div className={s.msCount}>
              {matches.length === VISIBLE_CAP
                ? `Showing first ${VISIBLE_CAP} of ${normalized.length} — keep typing to narrow`
                : `${matches.length} of ${normalized.length} match`}
            </div>
          )}
          {matches.length === 0 && <div className={s.msEmpty}>No matches</div>}
          {matches.map((o, i) => {
            const selected = valueSet.has(o.value);
            const cls = [s.msOption];
            if (i === active) cls.push(s.msOptionActive);
            if (selected) cls.push(s.msOptionSelected);
            return (
              <div
                key={o.value}
                className={cls.join(' ')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); toggle(o.value); }}
                role="option"
                aria-selected={selected}
              >
                <span>{o.label}</span>
                {selected && <span>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
