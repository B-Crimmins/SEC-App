import React from 'react';
import { Group, Paper, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import Sparkline from './Sparkline';
import { formatCurrency, formatPercent } from '../../../Utilities/formatters';
import { useUnits } from '../../../Utilities/UnitsContext';

const METRICS = [
  { key: 'revenue',              label: 'Revenue',            format: 'currency' },
  { key: 'gross_profit_margin',  label: 'Gross Margin',       format: 'percent'  },
  { key: 'net_margin',           label: 'Net Margin',         format: 'percent'  },
  { key: 'free_cash_flow',       label: 'Free Cash Flow',     format: 'currency' },
  { key: 'roe',                  label: 'Return on Equity',   format: 'percent'  },
  { key: 'earnings_per_share',   label: 'EPS',                format: 'eps'      },
];

const formatValue = (value, format, units) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return formatPercent(value);
  if (format === 'eps') return `$${value.toFixed(2)}`;
  return formatCurrency(value, units);
};

const KPICardSkeleton = () => (
  <Paper withBorder p="sm" radius="md">
    <Stack gap={6}>
      <Skeleton height={10} width="60%" />
      <Skeleton height={22} width="80%" />
      <Skeleton height={16} />
    </Stack>
  </Paper>
);

const KPIStrip = ({ data, loading, ticker }) => {
  const units = useUnits();

  const peerGroup = data?.calculated_ratios?.peer_group_ratios;
  const hasData = peerGroup && Object.keys(peerGroup).length > 0;

  if (loading && !hasData) {
    return (
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="sm" mb="md">
        {METRICS.map((m) => <KPICardSkeleton key={m.key} />)}
      </SimpleGrid>
    );
  }

  if (!hasData) return null;

  const t = (ticker || '').toUpperCase();
  const company = (t && peerGroup[t]) || Object.values(peerGroup)[0];
  if (!company?.periods) return null;

  const periods = Object.keys(company.periods).sort();
  if (periods.length === 0) return null;

  const latest = periods[periods.length - 1];
  const previous = periods.length > 1 ? periods[periods.length - 2] : null;
  const companyLabel = company.company_name || t || 'Primary ticker';

  return (
    <Stack gap={4} mb="md">
      <Group justify="space-between" align="baseline">
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" lts={0.5}>
          {companyLabel} · {latest}
        </Text>
        {loading && <Text size="xs" c="dimmed">Refreshing…</Text>}
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="sm">
        {METRICS.map((m) => {
          const series = periods
            .map((p) => company.periods[p]?.ratios?.[m.key]?.value)
            .filter((v) => typeof v === 'number');

          const latestVal = company.periods[latest]?.ratios?.[m.key]?.value;
          const prevVal = previous
            ? company.periods[previous]?.ratios?.[m.key]?.value
            : null;

          let deltaPct = null;
          if (
            typeof latestVal === 'number' &&
            typeof prevVal === 'number' &&
            prevVal !== 0
          ) {
            deltaPct = ((latestVal - prevVal) / Math.abs(prevVal)) * 100;
          }
          const deltaColor = deltaPct === null
            ? undefined
            : deltaPct >= 0 ? 'teal.7' : 'red.7';

          return (
            <Paper key={m.key} withBorder p="sm" radius="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" fw={500}>{m.label}</Text>
                <Text
                  size="lg"
                  fw={700}
                  style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}
                >
                  {formatValue(latestVal, m.format, units)}
                </Text>
                <Group justify="space-between" gap="xs" wrap="nowrap" align="center">
                  {deltaPct !== null ? (
                    <Text size="xs" c={deltaColor} fw={600}>
                      {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}% YoY
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">—</Text>
                  )}
                  <Sparkline values={series} />
                </Group>
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
};

export default KPIStrip;
