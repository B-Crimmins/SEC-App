import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { IconSearch, IconX } from '@tabler/icons-react';
import globalConfig from '../../global/globalConfig.json';
import { cn } from '../lib/utils';

// Tag-input combobox with autocomplete over /api/analysis/companies/search.
// Selected tickers are passed in as `value` (array of upper-case strings)
// and reported back via `onChange`. The component only adds tags that came
// out of the SEC index — typing a ticker that doesn't match and hitting
// Enter does nothing (per the chosen "block until matched" behavior).
export const TickerCombobox = ({ value = [], onChange, placeholder = 'Add a ticker…', disabled = false }) => {
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const addTicker = useCallback((ticker) => {
    const t = (ticker || '').trim().toUpperCase();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setInput('');
    setResults([]);
    setOpen(false);
    setHighlighted(0);
    inputRef.current?.focus();
  }, [value, onChange]);

  const removeTicker = useCallback((ticker) => {
    onChange(value.filter((t) => t !== ticker));
    inputRef.current?.focus();
  }, [value, onChange]);

  // Debounced server call. Cancel in-flight requests via an abort
  // controller so a fast typist's earlier responses can't clobber later
  // ones.
  useEffect(() => {
    const q = input.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const r = await axios.get(globalConfig.appUrl + '/api/analysis/companies/search', {
          params: { q, limit: 20 },
          headers: { Authorization: 'Bearer ' + sessionStorage.getItem('token') },
          signal: ctrl.signal,
        });
        const filtered = (r.data || []).filter((row) => !value.includes(row.ticker));
        setResults(filtered);
        setHighlighted(0);
        setOpen(filtered.length > 0);
      } catch (e) {
        if (axios.isCancel?.(e) || e?.name === 'CanceledError') return;
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [input, value]);

  // Click outside / Escape closes the dropdown.
  useEffect(() => {
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length === 0) return;
      setHighlighted((h) => (h + 1) % results.length);
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      setHighlighted((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Block-until-matched: only add tickers that came from the SEC
      // index. If nothing is highlighted, do nothing.
      if (open && results[highlighted]) {
        addTicker(results[highlighted].ticker);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      // Pop the last tag for fast cleanup.
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 p-1.5 rounded-md border border-border bg-input min-h-[40px]',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background',
          disabled && 'opacity-60 pointer-events-none'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <IconSearch size={14} className="text-muted-foreground ml-1 shrink-0" />
        {value.map((ticker) => (
          <span
            key={ticker}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-accent/15 text-accent text-xs font-semibold rounded"
          >
            {ticker}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTicker(ticker); }}
              aria-label={`Remove ${ticker}`}
              className="hover:bg-accent/30 rounded-sm p-0.5 leading-none"
            >
              <IconX size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <span className="text-[10px] text-muted-foreground pr-2">…</span>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-50 max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg"
          role="listbox"
        >
          {results.map((row, i) => (
            <div
              key={row.ticker}
              role="option"
              aria-selected={i === highlighted}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => { e.preventDefault(); addTicker(row.ticker); }}
              className={cn(
                'px-3 py-2 cursor-pointer flex items-center justify-between gap-3',
                i === highlighted ? 'bg-card-hover' : 'hover:bg-card-hover/60'
              )}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-foreground tabular-nums">{row.ticker}</span>
                <span className="text-xs text-muted-foreground truncate">{row.company_name}</span>
              </div>
              {row.exchange && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
                  {row.exchange}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {open && results.length === 0 && input.trim() && !loading && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
          No tickers match "{input.trim()}".
        </div>
      )}
    </div>
  );
};

export default TickerCombobox;
