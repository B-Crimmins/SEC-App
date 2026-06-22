import { useMemo } from 'react';
import { projectModel } from '../../../src/lib/projection';
import { runDcf } from '../../../src/lib/projectionDcf';
import { cn } from '../../../src/lib/utils';

// Hold the base case, perturb each driver by ±5%(pp), recompute DCF per share,
// rank by absolute Δ, render horizontal bars centered on zero. Helps the user
// see which assumption moves the valuation most — common pedagogical view in
// equity research.

const PERTURBATIONS = [
  { key: 'revenueGrowth', label: 'Revenue growth',     delta: 0.05,  format: 'pp' }, // ±5pp
  { key: 'grossMargin',   label: 'Gross margin',       delta: 0.05,  format: 'pp' },
  { key: 'opexPct',       label: 'Opex % revenue',     delta: 0.05,  format: 'pp' },
  { key: 'dso',           label: 'DSO',                delta: 15,    format: 'days' }, // ±15 days
  { key: 'dio',           label: 'DIO',                delta: 15,    format: 'days' },
  { key: 'dpo',           label: 'DPO',                delta: 15,    format: 'days' },
  { key: 'capexPct',      label: 'CapEx % revenue',    delta: 0.02,  format: 'pp' },
  { key: 'taxRate',       label: 'Tax rate',           delta: 0.05,  format: 'pp' },
];

const runOne = (history, drivers, horizon, wacc, gTerm, capStructure) => {
  const r = projectModel(history, drivers, horizon);
  const dcf = runDcf(r.fcfSeries, wacc, gTerm, capStructure);
  return dcf?.perShareValue ?? null;
};

const TornadoChart = ({ history, drivers, horizon, wacc, terminalGrowth, capStructure }) => {
  const bars = useMemo(() => {
    if (!history || !drivers) return [];
    const basePerShare = runOne(history, drivers, horizon, wacc, terminalGrowth, capStructure);
    if (basePerShare == null) return [];

    return PERTURBATIONS.map((p) => {
      const v = drivers[p.key];
      if (v == null) return null;
      const up   = { ...drivers, [p.key]: v + p.delta };
      const down = { ...drivers, [p.key]: v - p.delta };
      const upPs   = runOne(history, up,   horizon, wacc, terminalGrowth, capStructure);
      const downPs = runOne(history, down, horizon, wacc, terminalGrowth, capStructure);
      if (upPs == null || downPs == null) return null;
      return {
        key: p.key,
        label: p.label,
        delta: p.delta,
        format: p.format,
        upDiff:   upPs   - basePerShare,
        downDiff: downPs - basePerShare,
        spread:   Math.abs(upPs - downPs),
        basePerShare,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.spread - a.spread);
  }, [history, drivers, horizon, wacc, terminalGrowth, capStructure]);

  if (bars.length === 0) {
    return <div className="text-xs text-muted-foreground">Not enough data to compute sensitivity.</div>;
  }

  const maxAbs = Math.max(...bars.flatMap((b) => [Math.abs(b.upDiff), Math.abs(b.downDiff)]));
  const fmt = (v) => `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`;
  const deltaLabel = (b) =>
    b.format === 'pp' ? `±${(b.delta * 100).toFixed(1)}pp` : `±${b.delta}d`;

  const BAR_W = 240; // half-width per side

  return (
    <div className="space-y-1.5">
      {bars.map((b) => {
        const upPx   = maxAbs > 0 ? (Math.abs(b.upDiff)   / maxAbs) * BAR_W : 0;
        const downPx = maxAbs > 0 ? (Math.abs(b.downDiff) / maxAbs) * BAR_W : 0;
        const upPositive   = b.upDiff   >= 0;
        const downPositive = b.downDiff >= 0;
        return (
          <div key={b.key} className="grid grid-cols-[160px_1fr_64px] items-center gap-3 text-xs">
            <div className="text-foreground truncate">
              <span className="font-medium">{b.label}</span>
              <span className="text-muted-foreground ml-1">{deltaLabel(b)}</span>
            </div>
            <div className="relative h-5 flex items-center">
              {/* Center axis */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
              {/* Down (-Δ) bar */}
              <div
                className={cn(
                  'absolute h-3.5 rounded-l',
                  downPositive ? 'bg-gain/70' : 'bg-loss/70'
                )}
                style={{
                  right: '50%',
                  width: `${downPx}px`,
                }}
                title={`-${deltaLabel(b)}: ${fmt(b.downDiff)}`}
              />
              {/* Up (+Δ) bar */}
              <div
                className={cn(
                  'absolute h-3.5 rounded-r',
                  upPositive ? 'bg-gain/70' : 'bg-loss/70'
                )}
                style={{
                  left: '50%',
                  width: `${upPx}px`,
                }}
                title={`+${deltaLabel(b)}: ${fmt(b.upDiff)}`}
              />
            </div>
            <div className="text-right tabular-nums text-muted-foreground">
              <span title="Spread between up & down perturbations">${b.spread.toFixed(2)}</span>
            </div>
          </div>
        );
      })}
      <div className="text-[10px] text-muted-foreground pt-2 border-t border-border mt-2">
        Bars show $/share change vs. base case when each driver moves ± its noted amount. Green = price up, red = price down.
        Sorted by spread (the most sensitive drivers are at the top).
      </div>
    </div>
  );
};

export default TornadoChart;
