import { useEffect, useState } from 'react';
import { getDistinct } from './bankingApi';

// Fetch distinct values for `column`, scoped by `filters`. Debounced by 200ms
// so rapid filter edits only trigger one query.
export function useDistinct(column, filters) {
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const filterKey = JSON.stringify(filters || {});

  useEffect(() => {
    if (!column) return;
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      getDistinct(column, filters || {})
        .then((vs) => { if (!cancelled) { setValues(vs); setError(null); } })
        .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || e.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [column, filterKey]);

  return { values, loading, error };
}
