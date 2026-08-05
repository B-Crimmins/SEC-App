import { useRef } from 'react';
import { Button } from './ui/button';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Spinner } from './ui/spinner';
import { TickerCombobox } from './TickerCombobox';
import { UNIT_OPTIONS } from '../../Utilities/formatters';
import YearChipInput from './YearChipInput';

// Compact horizontal search bar that sits at the top of each portal.
// Self-contained over its inputs; loading + onSearch are externally wired
// because each portal owns its own fetch.
const PortalSearchBar = ({
  title,
  tickers, onTickersChange,
  reportType, onReportTypeChange,
  years, onYearsChange,
  units, onUnitsChange,
  loading,
  onSearch,
  hint,
}) => {
  const yearInputRef = useRef(null);

  const handleSearch = () => {
    const committedYears = yearInputRef.current?.commitPending() ?? years;
    onSearch(committedYears);
  };

  // When the user flips between 10-K and 10-Q we clear years rather than
  // auto-converting — 4-digit year and "Q1 2024" don't have a clean mapping.
  // Do NOT clear on the first selection (reportType was unset): users often
  // enter years before picking a type, and wiping chips makes the bar feel stuck.
  const handleReportTypeChange = (v) => {
    if (!v) return;
    if (v === reportType) return;
    const prev = reportType;
    onReportTypeChange(v);
    if (prev === '10-K' || prev === '10-Q') onYearsChange([]);
  };

  return (
    <div className="border-b border-border bg-card/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent px-1.5 py-1 rounded bg-accent/10">
          {title}
        </span>

        <div className="flex-1 min-w-[220px] max-w-[420px]">
          <TickerCombobox value={tickers} onChange={onTickersChange} placeholder="Search tickers…" />
        </div>

        <ToggleGroup
          type="single"
          value={reportType}
          onValueChange={handleReportTypeChange}
          size="sm"
          className="shrink-0"
        >
          <ToggleGroupItem value="10-K" className="px-2.5 text-xs">10-K</ToggleGroupItem>
          <ToggleGroupItem value="10-Q" className="px-2.5 text-xs">10-Q</ToggleGroupItem>
        </ToggleGroup>

        <div className="flex-1 min-w-[220px] max-w-[420px]">
          <YearChipInput ref={yearInputRef} value={years} onChange={onYearsChange} reportType={reportType} />
        </div>

        <ToggleGroup
          type="single"
          value={units}
          onValueChange={(v) => v && onUnitsChange(v)}
          size="sm"
          className="shrink-0"
        >
          {UNIT_OPTIONS.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} className="px-2.5 text-xs">
              {o.value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Button size="sm" onClick={handleSearch} disabled={loading} className="shrink-0">
          {loading ? <Spinner size="sm" className="mr-1.5" /> : null}
          Search
        </Button>
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-1.5 px-1.5">{hint}</div>
      )}
    </div>
  );
};

export default PortalSearchBar;
