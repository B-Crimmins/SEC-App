import React, { useState } from 'react';
import {
  Divider,
  Group,
  Paper,
  Popover,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';

// Ordered so rows read top-to-bottom like an income statement.
const ROW_ORDER = [
  'cost_of_goods_sold',
  'gross_margin',
  'sga',
  'research_and_development',
  'depreciation_amortization',
  'operating_expenses',
  'operating_margin',
  'pre_tax_margin',
  'effective_tax_rate',
  'net_margin',
  'ebit',
  'ebit_margin',
  'ebitda',
  'ebitda_margin',
  'adjusted_ebit',
];

// Rows whose value is already a percentage vs. rows that are dollar figures.
const DOLLAR_KEYS = new Set(['ebit', 'ebitda', 'adjusted_ebit']);

const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)}%`;
};

// Mirrors the RatioTooltipCell used on the Ratio Analysis tab: popover with
// formula, definition, components, and (single-ticker only) YoY delta +
// primary driver.
const CommonSizeTooltipCell = ({ formatted, tooltip, hideYoy }) => {
  const [opened, setOpened] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (!formatted) return '';
  if (!tooltip) return formatted;

  const { label, formula, definition, components, yoy } = tooltip;
  const driver = yoy?.primary_driver;
  const showYoy = !hideYoy && yoy && typeof yoy.delta === 'number';

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={340}
      position="top"
      withArrow
      shadow="md"
      closeOnClickOutside
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            padding: '2px 6px',
            borderRadius: 4,
            backgroundColor: hovered || opened ? 'var(--mantine-color-gray-2)' : 'transparent',
            transition: 'background-color 120ms ease',
            cursor: 'pointer',
            display: 'inline-block',
            lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatted}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text fw={600} size="sm">{label}</Text>
          {formula && <Text size="xs" c="dimmed"><b>Formula:</b> {formula}</Text>}
          {definition && <Text size="xs">{definition}</Text>}
          {Array.isArray(components) && components.length > 0 && (
            <Text size="xs" c="dimmed"><b>Components:</b> {components.join(', ')}</Text>
          )}
          {showYoy && (
            <>
              <Divider my={4} />
              <Group gap="xs" wrap="nowrap">
                <Text size="xs" fw={500}>YoY change:</Text>
                <Text size="xs">
                  {yoy.delta >= 0 ? '+' : ''}{yoy.delta.toFixed(2)}
                  {typeof yoy.delta_pct === 'number'
                    ? ` (${yoy.delta_pct >= 0 ? '+' : ''}${yoy.delta_pct.toFixed(1)}%)`
                    : ''}
                </Text>
              </Group>
              {driver && (
                <Text size="xs">
                  <b>Primary driver:</b> {driver.component_label}
                  {typeof driver.component_pct_change === 'number'
                    ? ` (${driver.component_pct_change >= 0 ? '+' : ''}${driver.component_pct_change.toFixed(1)}%)`
                    : ''}
                </Text>
              )}
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

const cellFor = (company, year, rowKey) => {
  const row = company?.periods?.[year]?.ratios?.[rowKey];
  if (!row) return { formatted: '—', tooltip: null };
  const formatted =
    row.value === null || row.value === undefined
      ? '—'
      : DOLLAR_KEYS.has(rowKey)
        ? formatCurrency(row.value)
        : formatPercent(row.value);
  return { formatted, tooltip: row.tooltip || null };
};

const CommonSize = ({ data }) => {
  if (!data || !data.companies || data.companies.length === 0) {
    return (
      <Stack pt="md">
        <Title order={4}>No common-size data available. Please search first.</Title>
      </Stack>
    );
  }

  const companies = data.companies;
  const years = (data.years && data.years.length > 0)
    ? [...data.years].sort((a, b) => b.localeCompare(a))
    : [];

  if (years.length === 0) {
    return (
      <Stack gap="sm" pt="md">
        <Title order={3}>Common Size</Title>
        <Title order={5} c="dimmed">No periods with extractable data.</Title>
      </Stack>
    );
  }

  // Derive row labels from whichever company/year has data first.
  const labelLookup = {};
  for (const company of companies) {
    for (const year of years) {
      const ratios = company.periods?.[year]?.ratios;
      if (!ratios) continue;
      for (const key of ROW_ORDER) {
        if (!labelLookup[key] && ratios[key]?.label) {
          labelLookup[key] = ratios[key].label;
        }
      }
    }
  }

  const visibleRows = ROW_ORDER.filter((key) => labelLookup[key] !== undefined);

  // YoY attribution only makes sense for a single-ticker view. Comparing two
  // or more tickers suppresses YoY and shows formula/definition only.
  const hideYoy = companies.length > 1;

  const numDataCols = years.length * companies.length;
  const colWidth = numDataCols > 0 ? `${70 / numDataCols}%` : 'auto';

  const headerCells = [
    <Table.Th key="metric" style={{ width: '30%' }}>Metric</Table.Th>,
  ];
  years.forEach((year) => {
    companies.forEach((company) => {
      headerCells.push(
        <Table.Th
          key={`${company.ticker}-${year}`}
          style={{ textAlign: 'right', width: colWidth }}
        >
          {company.ticker} {year}
        </Table.Th>
      );
    });
  });

  const rows = visibleRows.map((rowKey) => {
    const label = labelLookup[rowKey] || rowKey;
    const cells = [
      <Table.Td key="label" style={{ fontWeight: 500 }}>{label}</Table.Td>,
    ];
    years.forEach((year) => {
      companies.forEach((company) => {
        const { formatted, tooltip } = cellFor(company, year, rowKey);
        cells.push(
          <Table.Td
            key={`${company.ticker}-${year}`}
            style={{ textAlign: 'right' }}
          >
            <CommonSizeTooltipCell
              formatted={formatted}
              tooltip={tooltip}
              hideYoy={hideYoy}
            />
          </Table.Td>
        );
      });
    });
    return <Table.Tr key={rowKey}>{cells}</Table.Tr>;
  });

  return (
    <Stack gap="md" pt="md">
      <Title order={3}>Common Size Analysis</Title>
      <Paper withBorder p="md" radius="md">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>{headerCells}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
};

export default CommonSize;
