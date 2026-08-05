import { useEffect, useState } from 'react';
import { formatCurrency as sharedFormatCurrency } from '../../../Utilities/formatters';
import { useUnits } from '../../../Utilities/UnitsContext';
import { Card } from '../../../src/components/ui/card';
import { Skeleton } from '../../../src/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../src/components/ui/table';
import { cn } from '../../../src/lib/utils';

const BUCKETS = [
  { key: 'geography', title: 'Geographic Segments' },
  { key: 'product', title: 'Product Segments' },
  { key: 'business_segment', title: 'Business Segments' },
];

const buildBucketTable = (data, bucketKey) => {
  const periods = data?.periods || [];
  if (periods.length === 0) return null;

  const labelOrder = [];
  const seen = new Set();
  periods.forEach((period) => {
    const rows = data.by_period?.[period]?.[bucketKey] || [];
    rows.forEach((row) => {
      const label = row.label;
      if (!seen.has(label)) {
        seen.add(label);
        labelOrder.push(label);
      }
    });
  });

  if (labelOrder.length === 0) return null;

  const latestPeriod = periods[periods.length - 1];
  const latestMap = new Map(
    (data.by_period?.[latestPeriod]?.[bucketKey] || []).map((r) => [r.label, r.value])
  );
  labelOrder.sort((a, b) => (latestMap.get(b) ?? 0) - (latestMap.get(a) ?? 0));

  return { periods, labelOrder };
};

const SegmentTable = ({ title, data, bucketKey }) => {
  const units = useUnits();
  const formatCurrency = (v) => {
    const out = sharedFormatCurrency(v, units);
    return out === '—' ? '' : out;
  };
  const built = buildBucketTable(data, bucketKey);
  if (!built) return null;
  const { periods, labelOrder } = built;

  const valueFor = (period, label) => {
    const row = (data.by_period?.[period]?.[bucketKey] || []).find((r) => r.label === label);
    return row ? row.value : null;
  };

  return (
    <Card className="p-4">
      <h4 className="text-base font-semibold mb-3">{title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[35%]">Segment</TableHead>
            {periods.map((period) => (
              <TableHead key={period} className="text-right">{period}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {labelOrder.map((label) => (
            <TableRow key={label}>
              <TableCell className="font-medium">{label}</TableCell>
              {periods.map((period) => (
                <TableCell key={period} className="text-right tabular-nums">
                  {formatCurrency(valueFor(period, label))}
                </TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow className="border-t-2 border-border">
            <TableCell className="font-semibold">Total Revenue</TableCell>
            {periods.map((period) => (
              <TableCell key={period} className="text-right tabular-nums font-semibold">
                {formatCurrency(data.by_period?.[period]?.total)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
};

const SegmentsSkeleton = () => (
  <div className="space-y-4 pt-4">
    <Skeleton className="h-6 w-72" />
    {[0, 1, 2].map((i) => (
      <Card key={i} className="p-4">
        <Skeleton className="h-4 w-48 mb-3" />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((j) => (
            <Skeleton key={j} className="h-3.5 w-full" />
          ))}
        </div>
      </Card>
    ))}
  </div>
);

const Segments = ({ dataByTicker, tickers = [], loading }) => {
  // Pick the first loaded ticker that actually returned data; fall back to
  // the first input ticker so the chip strip still renders something.
  const validTickers = (tickers || []).filter((t) => t && t.trim() !== '');
  const tickersWithData = validTickers.filter((t) => dataByTicker?.[t]?.by_period);

  const [activeTicker, setActiveTicker] = useState(null);
  const key = validTickers.join('|') + '::' + tickersWithData.join('|');
  useEffect(() => {
    if (tickersWithData.length > 0) {
      setActiveTicker((cur) => (tickersWithData.includes(cur) ? cur : tickersWithData[0]));
    } else {
      setActiveTicker(null);
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && (!dataByTicker || Object.keys(dataByTicker).length === 0)) {
    return <SegmentsSkeleton />;
  }

  if (!dataByTicker || Object.keys(dataByTicker).length === 0) {
    return <h4 className="text-base font-semibold pt-4">No segment data available. Please search first.</h4>;
  }

  const renderSwitcher = () => {
    if (validTickers.length <= 1) return null;
    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Ticker</span>
        {validTickers.map((t) => {
          const hasData = !!dataByTicker?.[t]?.by_period;
          const isActive = t === activeTicker;
          return (
            <button
              key={t}
              type="button"
              onClick={() => hasData && setActiveTicker(t)}
              disabled={!hasData}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-semibold transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : hasData
                    ? 'bg-card-hover/40 text-muted-foreground hover:bg-card-hover hover:text-foreground'
                    : 'bg-card-hover/20 text-muted-foreground/40 cursor-not-allowed'
              )}
              title={hasData ? t : `${t} returned no segment data`}
            >
              {t}
            </button>
          );
        })}
      </div>
    );
  };

  const data = activeTicker ? dataByTicker[activeTicker] : null;

  if (!data || !data.by_period) {
    return (
      <div className="space-y-4 pt-4">
        {renderSwitcher()}
        <h4 className="text-base font-semibold">No segment data available for the selected ticker.</h4>
      </div>
    );
  }

  const tables = BUCKETS
    .map((b) => ({ ...b, built: buildBucketTable(data, b.key) }))
    .filter((b) => b.built !== null);

  if (tables.length === 0) {
    return (
      <div className="space-y-3 pt-4">
        {renderSwitcher()}
        <h3 className="text-lg font-semibold">Revenue Segments</h3>
        <p className="text-muted-foreground">
          {data.ticker || activeTicker} did not report segmented revenue for the selected periods.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      {renderSwitcher()}
      <h3 className="text-lg font-semibold">Revenue Segments — {data.ticker || activeTicker}</h3>
      {tables.map(({ key: k, title }) => (
        <SegmentTable key={k} title={title} data={data} bucketKey={k} />
      ))}
    </div>
  );
};

export default Segments;
