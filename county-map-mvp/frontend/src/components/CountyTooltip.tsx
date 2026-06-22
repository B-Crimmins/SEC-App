import type { CountyRecord, MetricKey } from '../types/county';
import styles from './CountyTooltip.module.css';

export interface TooltipState {
  x: number;
  y: number;
  record: CountyRecord | null;
  fallbackName: string;
  fips: string;
}

interface Props {
  state: TooltipState | null;
  metric: MetricKey;
}

const METRIC_LABELS: Record<MetricKey, string> = {
  property_count: 'Properties',
  avg_sale_price: 'Avg sale price',
  avg_estimated_value: 'Avg estimated value',
  involuntary_lien_count: 'Involuntary liens',
  hoa_lien_count: 'HOA liens',
};

function formatValue(metric: MetricKey, value: number | null): string {
  if (value === null) return '—';
  if (metric === 'avg_sale_price' || metric === 'avg_estimated_value') {
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  return value.toLocaleString();
}

export default function CountyTooltip({ state, metric }: Props) {
  if (!state) return null;
  const { x, y, record, fallbackName, fips } = state;
  const name = record?.county_name ?? fallbackName;
  const stateCode = record?.state ?? '';

  return (
    <div className={styles.tooltip} style={{ left: x + 12, top: y + 12 }}>
      <div className={styles.title}>
        {name}
        {stateCode ? `, ${stateCode}` : ''} <span className={styles.fips}>FIPS {fips}</span>
      </div>
      {record ? (
        <table className={styles.table}>
          <tbody>
            {(Object.keys(METRIC_LABELS) as MetricKey[]).map((m) => (
              <tr key={m} className={m === metric ? styles.active : undefined}>
                <td>{METRIC_LABELS[m]}</td>
                <td className={styles.value}>{formatValue(m, record.metrics[m] ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.empty}>No data for this county.</div>
      )}
    </div>
  );
}
