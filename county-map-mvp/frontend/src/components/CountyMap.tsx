import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { scaleQuantize } from 'd3-scale';

import type { CountyRecord, MetricKey } from '../types/county';
import CountyTooltip, { type TooltipState } from './CountyTooltip';
import styles from './CountyMap.module.css';

// us-atlas counties-10m TopoJSON, served from a CDN by default. To work
// offline, vendor the file to frontend/public/counties-10m.json and point
// `GEOGRAPHY_URL` at '/counties-10m.json'. See frontend/public/counties.README.md.
const GEOGRAPHY_URL =
  (import.meta.env.VITE_COUNTY_TOPOJSON_URL as string | undefined) ??
  'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

const COLOR_RANGE = [
  '#eef5ff',
  '#cfe3ff',
  '#9ec8ff',
  '#6aa8f5',
  '#3f87e0',
  '#1f63b8',
  '#10437f',
] as const;

const NO_DATA_FILL = '#e5e7eb';

interface Props {
  records: CountyRecord[];
  metric: MetricKey;
}

function metricValue(rec: CountyRecord | undefined, metric: MetricKey): number | null {
  if (!rec) return null;
  const v = rec.metrics[metric];
  return typeof v === 'number' ? v : null;
}

export default function CountyMap({ records, metric }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // FIPS -> aggregated record across all year buckets currently in `records`.
  // If the parent passes pre-filtered records (e.g. one year), each FIPS will
  // typically appear once anyway.
  const byFips = useMemo(() => {
    const map = new Map<string, CountyRecord>();
    for (const r of records) {
      const existing = map.get(r.county_fips);
      if (!existing) {
        map.set(r.county_fips, r);
        continue;
      }
      // Sum/average across year buckets so the map has one value per county.
      const merged: CountyRecord = {
        ...existing,
        year: null,
        metrics: {
          property_count: existing.metrics.property_count + r.metrics.property_count,
          involuntary_lien_count:
            existing.metrics.involuntary_lien_count + r.metrics.involuntary_lien_count,
          hoa_lien_count: existing.metrics.hoa_lien_count + r.metrics.hoa_lien_count,
          avg_sale_price: weightedAvg(
            existing.metrics.avg_sale_price,
            existing.metrics.property_count,
            r.metrics.avg_sale_price,
            r.metrics.property_count,
          ),
          avg_estimated_value: weightedAvg(
            existing.metrics.avg_estimated_value,
            existing.metrics.property_count,
            r.metrics.avg_estimated_value,
            r.metrics.property_count,
          ),
        },
      };
      map.set(r.county_fips, merged);
    }
    return map;
  }, [records]);

  const colorScale = useMemo(() => {
    const values = Array.from(byFips.values())
      .map((r) => metricValue(r, metric))
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      // Avoid a zero-width domain; map everything to mid color.
      return () => COLOR_RANGE[Math.floor(COLOR_RANGE.length / 2)];
    }
    return scaleQuantize<string>().domain([min, max]).range([...COLOR_RANGE]);
  }, [byFips, metric]);

  return (
    <div className={styles.wrap}>
      <ComposableMap projection="geoAlbersUsa" width={980} height={560} style={{ width: '100%', height: 'auto' }}>
        <Geographies geography={GEOGRAPHY_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const fips = String(geo.id).padStart(5, '0');
              const rec = byFips.get(fips);
              const v = metricValue(rec, metric);
              const fill = v !== null && colorScale ? colorScale(v) : NO_DATA_FILL;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={0.25}
                  onMouseEnter={(event) => {
                    setTooltip({
                      x: event.clientX,
                      y: event.clientY,
                      record: rec ?? null,
                      fallbackName: (geo.properties as { name?: string })?.name ?? fips,
                      fips,
                    });
                  }}
                  onMouseMove={(event) => {
                    setTooltip((t) =>
                      t ? { ...t, x: event.clientX, y: event.clientY } : t,
                    );
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', fill: '#facc15', cursor: 'pointer' },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      <CountyTooltip state={tooltip} metric={metric} />
    </div>
  );
}

function weightedAvg(
  aVal: number | null,
  aWeight: number,
  bVal: number | null,
  bWeight: number,
): number | null {
  if (aVal === null && bVal === null) return null;
  if (aVal === null) return bVal;
  if (bVal === null) return aVal;
  const w = aWeight + bWeight;
  if (w === 0) return (aVal + bVal) / 2;
  return (aVal * aWeight + bVal * bWeight) / w;
}
