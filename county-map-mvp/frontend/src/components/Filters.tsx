import type { Filters as FiltersState, MetricKey } from '../types/county';
import styles from './Filters.module.css';

interface Props {
  filters: FiltersState;
  states: string[];
  years: number[];
  metrics: MetricKey[];
  onChange: (next: FiltersState) => void;
  onIngest: () => void;
  ingesting: boolean;
}

const METRIC_LABELS: Record<MetricKey, string> = {
  property_count: 'Property count',
  avg_sale_price: 'Avg sale price',
  avg_estimated_value: 'Avg estimated value',
  involuntary_lien_count: 'Involuntary liens',
  hoa_lien_count: 'HOA liens',
};

export default function Filters({
  filters,
  states,
  years,
  metrics,
  onChange,
  onIngest,
  ingesting,
}: Props) {
  return (
    <div className={styles.bar}>
      <label className={styles.field}>
        <span>State</span>
        <select
          value={filters.state ?? ''}
          onChange={(e) => onChange({ ...filters, state: e.target.value || null })}
        >
          <option value="">All</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Year</span>
        <select
          value={filters.year ?? ''}
          onChange={(e) =>
            onChange({ ...filters, year: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">All</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Metric</span>
        <select
          value={filters.metric}
          onChange={(e) => onChange({ ...filters, metric: e.target.value as MetricKey })}
        >
          {metrics.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m] ?? m}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className={styles.ingest} onClick={onIngest} disabled={ingesting}>
        {ingesting ? 'Ingesting…' : 'Ingest raw JSON'}
      </button>
    </div>
  );
}
