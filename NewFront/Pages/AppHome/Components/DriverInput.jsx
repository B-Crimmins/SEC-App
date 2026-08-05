import { useMemo } from 'react';
import { IconRefresh } from '@tabler/icons-react';
import { Slider } from '../../../src/components/ui/slider';
import { cn } from '../../../src/lib/utils';

// One row in the Living Model driver rail. Supports two display modes:
//   format: 'percent' — value stored as decimal, displayed as %
//   format: 'days'    — value stored as days, displayed as integer
//
// `baseline` is the historical anchor (mean of trailing values). `series` is
// the raw history; we render a tiny inline sparkline so the user can see the
// dispersion as well as the average.
const DriverInput = ({
  label,
  description,
  format = 'percent',
  value,
  onChange,
  min,
  max,
  step,
  baseline,
  baselineLabel,
  series,
  changed = false,
}) => {
  const isPct = format === 'percent';
  const display = useMemo(() => {
    if (value == null || Number.isNaN(value)) return '—';
    if (isPct) return `${(value * 100).toFixed(2)}%`;
    return `${value.toFixed(1)}`;
  }, [value, isPct]);

  // Slider operates in display units (% or days) so step reads naturally.
  const sliderValue = isPct ? value * 100 : value;
  const sliderMin = min;
  const sliderMax = max;
  const sliderStep = step;
  const onSlider = ([v]) => onChange(isPct ? v / 100 : v);

  const baselineDisplay = useMemo(() => {
    if (baseline == null || Number.isNaN(baseline)) return null;
    if (isPct) return `${(baseline * 100).toFixed(2)}%`;
    return `${baseline.toFixed(1)} days`;
  }, [baseline, isPct]);

  const reset = () => baseline != null && onChange(baseline);

  // Sparkline coords — fixed width 60×16 box; gracefully handles 0/1 data points.
  const spark = useMemo(() => {
    const clean = (series || []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (clean.length < 2) return null;
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = max - min || Math.abs(max) || 1;
    const w = 60, h = 16;
    const step = w / (clean.length - 1);
    const pts = clean.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`).join(' ');
    return pts;
  }, [series]);

  return (
    <div
      className={cn(
        'p-3 rounded-md border transition-colors',
        changed
          ? 'border-accent/50 bg-accent/5'
          : 'border-border bg-card/30'
      )}
    >
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-accent">{display}</span>
      </div>
      {description && (
        <div className="text-[10px] text-muted-foreground mb-2 leading-snug">{description}</div>
      )}
      <Slider
        value={[sliderValue]}
        onValueChange={onSlider}
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        className="mt-1.5"
      />
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {spark && (
            <svg width="60" height="16" className="block">
              <polyline points={spark} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1" />
            </svg>
          )}
          {baselineDisplay && (
            <span>
              <span className="opacity-70">{baselineLabel || 'baseline'}:</span>{' '}
              <span className="font-medium text-foreground/80 tabular-nums">{baselineDisplay}</span>
            </span>
          )}
        </div>
        {changed && (
          <button
            type="button"
            onClick={reset}
            aria-label="Reset to baseline"
            className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 font-medium"
          >
            <IconRefresh size={10} /> Reset
          </button>
        )}
      </div>
    </div>
  );
};

export default DriverInput;
