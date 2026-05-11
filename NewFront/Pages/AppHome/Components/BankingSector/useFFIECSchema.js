import { useEffect, useState } from 'react';
import { getSchema } from './bankingApi';

let cached = null;
let inflight = null;

// Schema is tiny and immutable for a session — fetch once, share across hooks.
export function useFFIECSchema() {
  const [schema, setSchema] = useState(cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    inflight = inflight || getSchema();
    inflight
      .then((s) => { cached = s; if (!cancelled) setSchema(s); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || e.message); });
    return () => { cancelled = true; };
  }, []);

  return { schema, error };
}
