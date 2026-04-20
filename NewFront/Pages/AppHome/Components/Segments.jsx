import React from 'react';
import { Paper, Stack, Table, Text, Title } from '@mantine/core';

const BUCKETS = [
  { key: 'geography', title: 'Geographic Segments' },
  { key: 'product', title: 'Product Segments' },
  { key: 'business_segment', title: 'Business Segments' },
];

const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const absValue = Math.abs(value);
  if (absValue >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (absValue >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (absValue >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
};

const buildBucketTable = (data, bucketKey) => {
  const periods = data?.periods || [];
  if (periods.length === 0) return null;

  // Union of all labels across periods (filing-scoped, so some periods may
  // introduce or drop segments).
  const labelOrder = [];
  const seen = new Set();
  periods.forEach((period) => {
    const rows = data.by_period?.[period]?.[bucketKey] || [];
    rows.forEach((row) => {
      const label = row.label;
      if (!seen.has(label)) {
        seen.add(label);
        labelOrder.push(label);
      }
    });
  });

  if (labelOrder.length === 0) return null;

  // Sort labels by most recent period's value (desc) for readability.
  const latestPeriod = periods[periods.length - 1];
  const latestMap = new Map(
    (data.by_period?.[latestPeriod]?.[bucketKey] || []).map((r) => [r.label, r.value])
  );
  labelOrder.sort((a, b) => (latestMap.get(b) ?? 0) - (latestMap.get(a) ?? 0));

  return { periods, labelOrder };
};

const SegmentTable = ({ title, data, bucketKey }) => {
  const built = buildBucketTable(data, bucketKey);
  if (!built) return null;
  const { periods, labelOrder } = built;

  const valueFor = (period, label) => {
    const row = (data.by_period?.[period]?.[bucketKey] || []).find((r) => r.label === label);
    return row ? row.value : null;
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Title order={4} pb="sm">{title}</Title>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: '35%' }}>Segment</Table.Th>
            {periods.map((period) => (
              <Table.Th key={period} style={{ textAlign: 'right' }}>{period}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {labelOrder.map((label) => (
            <Table.Tr key={label}>
              <Table.Td style={{ fontWeight: 500 }}>{label}</Table.Td>
              {periods.map((period) => (
                <Table.Td key={period} style={{ textAlign: 'right' }}>
                  {formatCurrency(valueFor(period, label))}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
          <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-gray-5)' }}>
            <Table.Td style={{ fontWeight: 600 }}>Total Revenue</Table.Td>
            {periods.map((period) => (
              <Table.Td key={period} style={{ textAlign: 'right', fontWeight: 600 }}>
                {formatCurrency(data.by_period?.[period]?.total)}
              </Table.Td>
            ))}
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Paper>
  );
};

const Segments = ({ data }) => {
  if (!data || !data.by_period) {
    return <Title order={4}>No segment data available. Please search first.</Title>;
  }

  const tables = BUCKETS
    .map((b) => ({ ...b, built: buildBucketTable(data, b.key) }))
    .filter((b) => b.built !== null);

  if (tables.length === 0) {
    return (
      <Stack gap="sm" pt="md">
        <Title order={3}>Revenue Segments</Title>
        <Text c="dimmed">
          {data.ticker} did not report segmented revenue for the selected periods.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md" pt="md">
      <Title order={3}>
        Revenue Segments — {data.ticker}
      </Title>
      {tables.map(({ key, title }) => (
        <SegmentTable key={key} title={title} data={data} bucketKey={key} />
      ))}
    </Stack>
  );
};

export default Segments;
