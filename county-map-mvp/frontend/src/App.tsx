import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchCounties, fetchMetadata, triggerIngest } from './api/client';
import CountyMap from './components/CountyMap';
import Filters from './components/Filters';
import Layout from './components/Layout';
import type {
  CountyRecord,
  Filters as FiltersState,
  MetricKey,
  MetadataResponse,
} from './types/county';
import styles from './App.module.css';

const DEFAULT_METRIC: MetricKey = 'property_count';

export default function App() {
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [filters, setFilters] = useState<FiltersState>({
    state: null,
    year: null,
    metric: DEFAULT_METRIC,
  });
  const [records, setRecords] = useState<CountyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    try {
      const md = await fetchMetadata();
      setMetadata(md);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadCounties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCounties({
        state: filters.state,
        year: filters.year,
        metric: filters.metric,
      });
      setRecords(res.records);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    loadCounties();
  }, [loadCounties]);

  const onIngest = useCallback(async () => {
    setIngesting(true);
    setIngestMessage(null);
    setError(null);
    try {
      const res = await triggerIngest();
      setIngestMessage(res.message);
      await loadMetadata();
      await loadCounties();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIngesting(false);
    }
  }, [loadMetadata, loadCounties]);

  const status = useMemo(() => {
    if (!metadata) return null;
    const src = (metadata.file_status as { active_source?: string })?.active_source ?? 'unknown';
    return (
      <>
        <div>
          {metadata.record_count} records · source: <code>{src}</code>
        </div>
        {ingestMessage ? <div className={styles.ingestMsg}>{ingestMessage}</div> : null}
      </>
    );
  }, [metadata, ingestMessage]);

  return (
    <Layout
      title="County Map MVP"
      subtitle="TotalView reports aggregated to U.S. counties."
      status={status}
      filters={
        <Filters
          filters={filters}
          states={metadata?.available_states ?? []}
          years={metadata?.available_years ?? []}
          metrics={metadata?.available_metrics ?? [DEFAULT_METRIC]}
          onChange={setFilters}
          onIngest={onIngest}
          ingesting={ingesting}
        />
      }
    >
      {error ? <div className={styles.error}>Error: {error}</div> : null}
      {loading ? <div className={styles.loading}>Loading counties…</div> : null}
      {!loading && !error && records.length === 0 ? (
        <div className={styles.empty}>
          No records yet. Drop a JSON file in <code>backend/app/data/raw/</code> and click
          “Ingest raw JSON”.
        </div>
      ) : null}
      <CountyMap records={records} metric={filters.metric} />
    </Layout>
  );
}
