import { useEffect, useState } from 'react';
import { runQuery } from './bankingApi';

// Execute a query spec and return { rows, sql, bytesProcessed, loading, error }.
// Re-runs whenever any part of the spec changes. Debounced so rapid shelf
// edits on the same card don't fire a BQ job on every keystroke.
export function useQuery(spec, { enabled = true, debounceMs = 300 } = {}) {
  const [state, setState] = useState({
    rows: [],
    sql: null,
    bytesProcessed: 0,
    loading: false,
    error: null,
  });

  const key = JSON.stringify(spec);

  useEffect(() => {
    if (!enabled) { setState((s) => ({ ...s, loading: false })); return; }
    if (!spec || (!spec.dimensions?.length && !spec.measures?.length)) {
      setState({ rows: [], sql: null, bytesProcessed: 0, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const handle = setTimeout(() => {
      runQuery(spec)
        .then((data) => {
          if (cancelled) return;
          setState({
            rows: data.rows || [],
            sql: data.sql,
            bytesProcessed: data.bytes_processed || 0,
            loading: false,
            error: null,
          });
        })
        .catch((e) => {
          if (cancelled) return;
          setState({
            rows: [],
            sql: null,
            bytesProcessed: 0,
            loading: false,
            error: e?.response?.data?.detail || e.message,
          });
        });
    }, debounceMs);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [key, enabled]);

  return state;
}
