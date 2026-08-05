import Sparkline from './Sparkline';
import { formatCurrency, formatPercent } from '../../../Utilities/formatters';
import { useUnits } from '../../../Utilities/UnitsContext';
import { Card } from '../../../src/components/ui/card';
import { Skeleton } from '../../../src/components/ui/skeleton';
import { cn } from '../../../src/lib/utils';

const METRICS = [
  { key: 'revenue',              label: 'Revenue',           format: 'currency' },
  { key: 'gross_profit_margin',  label: 'Gross Margin',      format: 'percent'  },
  { key: 'net_margin',           label: 'Net Margin',        format: 'percent'  },
  { key: 'free_cash_flow',       label: 'Free Cash Flow',    format: 'currency' },
  { key: 'roe',                  label: 'Return on Equity',  format: 'percent'  },
  { key: 'earnings_per_share',   label: 'EPS',               format: 'eps'      },
];

const formatValue = (value, format, units) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return formatPercent(value);
  if (format === 'eps') return `$${value.toFixed(2)}`;
  return formatCurrency(value, units);
};

const KPICardSkeleton = () => (
  <Card className="p-3 space-y-2">
    <Skeleton className="h-2.5 w-3/5" />
    <Skeleton className="h-5 w-4/5" />
    <Skeleton className="h-4 w-full" />
  </Card>
);

const KPIStrip = ({ data, loading, ticker }) => {
  const units = useUnits();

  const peerGroup = data?.calculated_ratios?.peer_group_ratios;
  const hasData = peerGroup && Object.keys(peerGroup).length > 0;

  if (loading && !hasData) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        {METRICS.map((m) => (
          <KPICardSkeleton key={m.key} />
        ))}
      </div>
    );
  }

  if (!hasData) return null;

  const t = (ticker || '').toUpperCase();
  const company = (t && peerGroup[t]) || Object.values(peerGroup)[0];
  if (!company?.periods) return null;

  const periods = Object.keys(company.periods).sort();
  if (periods.length === 0) return null;

  const latest = periods[periods.length - 1];
  const previous = periods.length > 1 ? periods[periods.length - 2] : null;
  const companyLabel = company.company_name || t || 'Primary ticker';

  return (
    <div className="mb-4 space-y-1">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {companyLabel} · {latest}
        </div>
        {loading && <div className="text-xs text-muted-foreground">Refreshing…</div>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {METRICS.map((m) => {
          const series = periods
            .map((p) => company.periods[p]?.ratios?.[m.key]?.value)
            .filter((v) => typeof v === 'number');

          const latestVal = company.periods[latest]?.ratios?.[m.key]?.value;
          const prevVal = previous ? company.periods[previous]?.ratios?.[m.key]?.value : null;

          let deltaPct = null;
          if (typeof latestVal === 'number' && typeof prevVal === 'number' && prevVal !== 0) {
            deltaPct = ((latestVal - prevVal) / Math.abs(prevVal)) * 100;
          }

          return (
            <Card key={m.key} className="p-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">{m.label}</div>
                <div className="text-lg font-bold tabular-nums leading-tight">
                  {formatValue(latestVal, m.format, units)}
                </div>
                <div className="flex items-center justify-between gap-2">
                  {deltaPct !== null ? (
                    <span className={cn('text-xs font-semibold', deltaPct >= 0 ? 'text-gain' : 'text-loss')}>
                      {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}% YoY
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  <Sparkline values={series} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default KPIStrip;
