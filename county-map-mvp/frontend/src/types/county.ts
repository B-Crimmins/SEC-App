export type MetricKey =
  | 'property_count'
  | 'avg_sale_price'
  | 'avg_estimated_value'
  | 'involuntary_lien_count'
  | 'hoa_lien_count';

export interface CountyMetrics {
  property_count: number;
  avg_sale_price: number | null;
  avg_estimated_value: number | null;
  involuntary_lien_count: number;
  hoa_lien_count: number;
}

export interface CountyRecord {
  county_fips: string;
  county_name: string;
  state: string;
  year: number | null;
  metrics: CountyMetrics;
}

export interface CountiesResponse {
  records: CountyRecord[];
  count: number;
  filters_applied: {
    state: string | null;
    year: number | null;
    metric: string | null;
  };
}

export interface MetadataResponse {
  available_states: string[];
  available_years: number[];
  available_metrics: MetricKey[];
  record_count: number;
  file_status: Record<string, unknown>;
}

export interface IngestResponse {
  ok: boolean;
  message: string;
  records_written: number;
  source_path: string;
  output_path: string;
}

export interface Filters {
  state: string | null;
  year: number | null;
  metric: MetricKey;
}
