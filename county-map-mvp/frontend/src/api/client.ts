import type {
  CountiesResponse,
  IngestResponse,
  MetadataResponse,
} from '../types/county';

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.detail ?? JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new Error(`API ${res.status} ${res.statusText}: ${detail}`);
  }
  return (await res.json()) as T;
}

export interface CountyQuery {
  state?: string | null;
  year?: number | null;
  metric?: string | null;
}

export function fetchCounties(query: CountyQuery = {}): Promise<CountiesResponse> {
  const qs = new URLSearchParams();
  if (query.state) qs.set('state', query.state);
  if (query.year !== undefined && query.year !== null) qs.set('year', String(query.year));
  if (query.metric) qs.set('metric', query.metric);
  const suffix = qs.toString() ? `?${qs}` : '';
  return request<CountiesResponse>(`/api/data/counties${suffix}`);
}

export function fetchMetadata(): Promise<MetadataResponse> {
  return request<MetadataResponse>('/api/data/metadata');
}

export function triggerIngest(filename?: string): Promise<IngestResponse> {
  return request<IngestResponse>('/api/data/ingest', {
    method: 'POST',
    body: JSON.stringify(filename ? { filename } : {}),
  });
}
