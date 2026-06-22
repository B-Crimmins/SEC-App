import { useRef, useState } from 'react';
import { IconCalendarMonth, IconX } from '@tabler/icons-react';
import { cn } from '../lib/utils';

// Tag-input style period picker.
//   value      = array of period strings ["2023", "2024"] or ["Q1 2024"]
//   reportType = '10-K' | '10-Q' — drives the input parser + chip format
//
// 10-K: input expects a 4-digit year; Enter adds it as a chip.
// 10-Q: input expects "Q1 2024" (or just "Q1-2024" / "1 2024"); we normalize.
const YEAR_RE = /^(19|20)\d{2}$/;
const QUARTER_RE = /^q?\s*([1-4])\s*[-/, ]?\s*((?:19|20)\d{2})$|^((?:19|20)\d{2})\s*[-/, ]?\s*q?\s*([1-4])$/i;

const normalize = (raw, reportType) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (reportType === '10-K') {
    return YEAR_RE.test(s) ? s : null;
  }
  // 10-Q parsing
  const m = s.match(QUARTER_RE);
  if (!m) return null;
  const q = m[1] || m[4];
  const y = m[2] || m[3];
  return `Q${q} ${y}`;
};

const YearChipInput = ({
  value = [],
  onChange,
  reportType = '10-K',
  placeholder,
  disabled = false,
}) => {
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  const ph = placeholder ?? (reportType === '10-Q' ? 'Q1 2024' : 'YYYY');

  const tryAdd = () => {
    const norm = normalize(input, reportType);
    if (!norm) {
      setTouched(true);
      return;
    }
    if (!value.includes(norm)) onChange([...value, norm]);
    setInput('');
    setTouched(false);
    inputRef.current?.focus();
  };

  const removeAt = (idx) => onChange(value.filter((_, i) => i !== idx));

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryAdd();
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const invalid = touched && input.trim() !== '' && !normalize(input, reportType);

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        'flex flex-wrap items-center gap-1 px-2 py-1 rounded-md border bg-input min-h-[36px]',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background',
        invalid ? 'border-loss/60' : 'border-border',
        disabled && 'opacity-60 pointer-events-none'
      )}
    >
      <IconCalendarMonth size={13} className="text-muted-foreground ml-0.5 shrink-0" />
      {value.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 bg-accent/15 text-accent text-[11px] font-semibold rounded tabular-nums"
        >
          {v}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeAt(i); }}
            aria-label={`Remove ${v}`}
            className="hover:bg-accent/30 rounded-sm p-0.5 leading-none"
          >
            <IconX size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => { setInput(e.target.value); setTouched(false); }}
        onKeyDown={onKeyDown}
        placeholder={value.length === 0 ? ph : ''}
        disabled={disabled}
        className="flex-1 min-w-[60px] bg-transparent outline-none text-xs text-foreground placeholder:text-muted-foreground tabular-nums"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
};

export default YearChipInput;
