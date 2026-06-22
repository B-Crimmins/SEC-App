import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Pagination,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
  IconChartBar,
} from '@tabler/icons-react';
import globalConfig from '../../../global/globalConfig.json';

// Display lineup — same metric keys the backend caches. Suffix drives formatting.
const METRICS = [
  { key: 'gross_profit_margin',  label: 'Gross Margin',  suffix: '%' },
  { key: 'operating_margin',     label: 'Op Margin',     suffix: '%' },
  { key: 'net_margin',           label: 'Net Margin',    suffix: '%' },
  { key: 'ebitda_margin',        label: 'EBITDA Margin', suffix: '%' },
  { key: 'roe',                  label: 'ROE',           suffix: '%' },
  { key: 'roa',                  label: 'ROA',           suffix: '%' },
  { key: 'roic',                 label: 'ROIC',          suffix: '%' },
  { key: 'current_ratio',        label: 'Current',       suffix: 'x' },
  { key: 'quick_ratio',          label: 'Quick',         suffix: 'x' },
  { key: 'debt_to_equity',       label: 'D/E',           suffix: '' },
  { key: 'interest_coverage',    label: 'Int Cov',       suffix: 'x' },
  { key: 'inventory_turnover',   label: 'Inv Turn',      suffix: 'x' },
  { key: 'sga_percent_of_revenue', label: 'SG&A %',      suffix: '%' },
];

const LOWER_IS_BETTER = new Set(['debt_to_equity', 'sga_percent_of_revenue']);
const PAGE_SIZE_OPTIONS = ['25', '50', '100', '200'];

const fmtVal = (v, suffix) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const fixed = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  return `${fixed}${suffix}`;
};

const fmtFreshness = (iso) => {
  if (!iso) return 'never refreshed';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const SortIcon = ({ active, dir }) => {
  if (!active) return <IconArrowsSort size={12} style={{ opacity: 0.4 }} />;
  return dir === 'desc' ? <IconArrowDown size={12} /> : <IconArrowUp size={12} />;
};

const SortableTh = ({ label, sortKey, sortBy, sortDir, onSort, align = 'left' }) => {
  const active = sortBy === sortKey;
  const next = active && sortDir === 'asc' ? 'desc' : 'asc';
  return (
    <Table.Th style={{ textAlign: align, whiteSpace: 'nowrap', cursor: 'pointer' }}
              onClick={() => onSort(sortKey, next)}>
      <Group gap={4} justify={align === 'right' ? 'flex-end' : 'flex-start'} wrap="nowrap">
        <Text size="xs" fw={600} tt="uppercase" c={active ? undefined : 'dimmed'}>{label}</Text>
        <SortIcon active={active} dir={sortDir} />
      </Group>
    </Table.Th>
  );
};

const MetricCell = ({ value, average, suffix, metricKey }) => {
  if (value === null || value === undefined) {
    return <Text size="xs" c="dimmed">—</Text>;
  }
  const formatted = fmtVal(value, suffix);
  if (average === null || average === undefined) {
    return <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatted}</Text>;
  }
  const delta = value - average;
  const better = LOWER_IS_BETTER.has(metricKey) ? delta < 0 : delta > 0;
  const color = Math.abs(delta) < 1e-6 ? undefined : (better ? 'teal' : 'red');
  return (
    <Stack gap={0} align="flex-end">
      <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatted}</Text>
      {color && (
        <Text size="xs" c={color} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {delta > 0 ? '+' : ''}{fmtVal(delta, suffix)}
        </Text>
      )}
    </Stack>
  );
};

const BenchmarkPortal = () => {
  const [options, setOptions] = useState(null);
  const [exchange, setExchange] = useState('NYSE');
  const [sector, setSector] = useState(null);
  const [industry, setIndustry] = useState(null);
  const [sortBy, setSortBy] = useState('ticker');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('50');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Industry average is the more granular bucket per spec; sector falls back when
  // no industry-level avg exists (e.g. only one filer in the industry → n=1).
  const [avgScope, setAvgScope] = useState('industry');  // 'industry' | 'sector'

  // Load filter options on mount.
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(globalConfig.appUrl + '/api/analysis/screener/options', {
          headers: { Authorization: 'Bearer ' + sessionStorage.getItem('token') },
        });
        setOptions(r.data);
        if (r.data?.exchanges?.length && !r.data.exchanges.includes(exchange)) {
          setExchange(r.data.exchanges[0]);
        }
      } catch (e) {
        setError(e.response?.data?.detail || e.message || 'Failed to load filter options.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch screener page when filters/sort/page change.
  useEffect(() => {
    if (!options) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {
          exchange, sort_by: sortBy, sort_dir: sortDir,
          page, page_size: parseInt(pageSize, 10),
        };
        if (sector)   params.sector   = sector;
        if (industry) params.industry = industry;
        const r = await axios.get(globalConfig.appUrl + '/api/analysis/screener', {
          params,
          headers: { Authorization: 'Bearer ' + sessionStorage.getItem('token') },
        });
        if (cancelled) return;
        setData(r.data);
      } catch (e) {
        if (cancelled) return;
        setError(e.response?.data?.detail || e.message || 'Screener request failed.');
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [options, exchange, sector, industry, sortBy, sortDir, page, pageSize]);

  const onSort = (key, dir) => { setSortBy(key); setSortDir(dir); setPage(1); };

  // Look up the right average for a row + metric. Industry first, then
  // sector fallback (per spec: use the more granular bucket between
  // industry and sector — but if industry has only n=1, fall through to
  // sector since n=1 isn't an average).
  const averageFor = (row, metricKey) => {
    if (!data) return null;
    const indAvgs = data.averages?.by_industry?.[row.industry];
    const indEntry = indAvgs?.[metricKey];
    if (indEntry && (indEntry.n || 0) >= 2) return indEntry.mean;
    const secAvgs = data.averages?.by_sector?.[row.sector];
    const secEntry = secAvgs?.[metricKey];
    if (secEntry && (secEntry.n || 0) >= 2) return secEntry.mean;
    return null;
  };

  const totalPages = useMemo(() => {
    if (!data) return 1;
    const total = data.pagination?.total || 0;
    const sz = parseInt(pageSize, 10) || 50;
    return Math.max(1, Math.ceil(total / sz));
  }, [data, pageSize]);

  const universeFresh = data?.freshness?.universe || options?.freshness?.universe;
  const ratiosFresh = data?.freshness?.ratios || options?.freshness?.ratios;

  return (
    <Box p="md">
      <Group gap="sm" align="center" mb="xs">
        <IconChartBar size={28} />
        <Title order={2}>Industry Benchmark</Title>
        {ratiosFresh && (
          <Tooltip label={`Universe refreshed ${fmtFreshness(universeFresh)} · Ratios ${fmtFreshness(ratiosFresh)}`}>
            <Badge variant="light" color="gray" style={{ cursor: 'help' }}>
              Data as of {fmtFreshness(ratiosFresh)}
            </Badge>
          </Tooltip>
        )}
      </Group>
      <Text c="dimmed" mb="md">
        Every listed filer's ratios vs the industry average, paginated. Click a column
        header to sort. Industry average uses the more granular of (industry, sector)
        with n ≥ 2; otherwise the cell shows the bare value.
      </Text>

      <Paper withBorder p="sm" radius="md" mb="md">
        <Group gap="md" wrap="wrap" align="flex-end">
          <Select
            label="Exchange"
            value={exchange}
            onChange={(v) => { setExchange(v || 'NYSE'); setPage(1); setSector(null); setIndustry(null); }}
            data={(options?.exchanges || ['NYSE', 'Nasdaq']).map((e) => ({ value: e, label: e }))}
            w={140}
            allowDeselect={false}
          />
          <Select
            label="Sector"
            placeholder="All sectors"
            value={sector}
            onChange={(v) => { setSector(v); setPage(1); }}
            data={(options?.sectors || []).map((s) => ({ value: s, label: s }))}
            clearable
            searchable
            w={240}
          />
          <Select
            label="Industry"
            placeholder="All industries"
            value={industry}
            onChange={(v) => { setIndustry(v); setPage(1); }}
            data={(options?.industries || []).map((i) => ({ value: i, label: i }))}
            clearable
            searchable
            w={260}
          />
          <Select
            label="Avg bucket"
            value={avgScope}
            onChange={(v) => setAvgScope(v || 'industry')}
            data={[{ value: 'industry', label: 'Industry (granular)' }, { value: 'sector', label: 'Sector (broad)' }]}
            w={180}
            allowDeselect={false}
          />
          <Select
            label="Per page"
            value={pageSize}
            onChange={(v) => { setPageSize(v || '50'); setPage(1); }}
            data={PAGE_SIZE_OPTIONS}
            w={100}
            allowDeselect={false}
          />
        </Group>
      </Paper>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="md" variant="light">
          {error}
        </Alert>
      )}

      {!data && loading && (
        <Group justify="center" my="xl"><Loader size="sm" /></Group>
      )}

      {data && (
        <Paper withBorder radius="md">
          <Group justify="space-between" p="md" pb="xs" wrap="wrap">
            <Group gap="xs">
              <Title order={5}>
                {exchange}
                {sector && <> · {sector}</>}
                {industry && <> · {industry}</>}
              </Title>
              <Badge variant="light" color="blue">
                {(data.pagination?.total || 0).toLocaleString()} filers
              </Badge>
            </Group>
            {loading && <Loader size="xs" />}
          </Group>

          <ScrollArea>
            <Table withTableBorder withColumnBorders striped highlightOnHover stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <SortableTh label="Ticker"    sortKey="ticker"       sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Company"   sortKey="company_name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Exchange"  sortKey="exchange"     sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Sector"    sortKey="sector"       sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Industry"  sortKey="industry"     sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  {METRICS.map((m) => (
                    <SortableTh
                      key={m.key} label={m.label} sortKey={m.key}
                      sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right"
                    />
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(data.rows || []).map((row) => (
                  <Table.Tr key={row.ticker}>
                    <Table.Td fw={600}>{row.ticker}</Table.Td>
                    <Table.Td><Text size="xs" lineClamp={1}>{row.company_name}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{row.exchange}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{row.sector || '—'}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{row.industry || '—'}</Text></Table.Td>
                    {METRICS.map((m) => {
                      const value = row.ratios?.[m.key];
                      const avg = avgScope === 'sector'
                        ? data.averages?.by_sector?.[row.sector]?.[m.key]?.mean ?? null
                        : averageFor(row, m.key);
                      return (
                        <Table.Td key={m.key} style={{ textAlign: 'right' }}>
                          <MetricCell value={value} average={avg} suffix={m.suffix} metricKey={m.key} />
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                ))}
                {(data.rows || []).length === 0 && !loading && (
                  <Table.Tr>
                    <Table.Td colSpan={5 + METRICS.length}>
                      <Text size="sm" c="dimmed" ta="center" py="md">
                        No rows match the current filters. Try widening the exchange or removing sector/industry filters.
                        If the cache is empty, an admin needs to run the screener refresh first.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          <Group justify="space-between" p="md" pt="xs">
            <Text size="xs" c="dimmed">
              Page {data.pagination?.page || 1} of {totalPages.toLocaleString()} ·
              showing {data.rows?.length || 0} of {(data.pagination?.total || 0).toLocaleString()}
            </Text>
            <Pagination
              value={page}
              onChange={setPage}
              total={totalPages}
              size="sm"
              withEdges
              siblings={1}
            />
          </Group>
        </Paper>
      )}
    </Box>
  );
};

export default BenchmarkPortal;
