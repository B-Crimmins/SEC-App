import React, { useState } from 'react';
import { Divider, Group, Popover, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core';

const RatioTooltipCell = ({ formatted, tooltip, hideYoy }) => {
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
                  {typeof yoy.delta_pct === 'number' ? ` (${yoy.delta_pct >= 0 ? '+' : ''}${yoy.delta_pct.toFixed(1)}%)` : ''}
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

const RATIO_LABELS = {
  net_working_capital_ratio: 'Net Working Capital Ratio',
  current_ratio: 'Current Ratio',
  quick_ratio: 'Quick Ratio',
  cash_ratio: 'Cash Ratio',
  debt_to_equity: 'Debt to Equity',
  debt_to_total_capitalization: 'Debt to Total Capitalization',
  total_assets_to_equity: 'Total Assets / Equity',
  book_value: 'Book Value',
  tangible_book_value: 'Tangible Book Value',
  average_age_of_plant: 'Average Age of Plant',
  average_remaining_life_of_plant: 'Average Remaining Life of Plant',
  average_total_life_span_of_plant: 'Average Total Life Span of Plant',
  inventory_turnover: 'Inventory Turnover',
  receivables_ratio: 'Receivables Ratio',
  operating_cash_flow_to_net_income: 'Operating Cash Flow / Net Income',
  capex_to_depreciation: 'CapEx / Depreciation',
  free_cash_flow: 'Free Cash Flow',
  revenue: 'Revenue',
  gross_profit_margin: 'Gross Profit Margin',
  operating_margin: 'Operating Margin',
  net_margin: 'Net Margin',
  ebitda_margin: 'EBITDA Margin',
  sga_percent_of_revenue: 'SG&A as % of Revenue',
  effective_tax_rate: 'Effective Tax Rate',
  roa: 'Return on Assets',
  roe: 'Return on Equity',
  roic: 'Return on Invested Capital',
  interest_coverage: 'Interest Coverage',
  earnings_per_share: 'Earnings Per Share',
};

const FinancialComparisonTable = ({ data, selectedTickers }) => {
  // Add error handling for missing or malformed data
  if (!data || !data.calculated_ratios) {
    return <Title order={4}>No data available. Please search first.</Title>;
  }

  const { peer_group_ratios } = data.calculated_ratios;
  
  if (!peer_group_ratios || Object.keys(peer_group_ratios).length === 0) {
    return <Title order={4}>No ratio data found.</Title>;
  }

  const allCompanies = Object.entries(peer_group_ratios).map(([ticker, info]) => ({
    ticker,
    name: info.company_name,
    periods: info.periods
  }));

  const companies = selectedTickers 
    ? allCompanies.filter(company => selectedTickers.includes(company.ticker))
    : allCompanies;

  if (companies.length === 0) {
    return <Title order={4}>No companies selected</Title>;
  }

  const firstCompany = companies[0];
  const years = Object.keys(firstCompany.periods).sort((a, b) => b.localeCompare(a)); // Recent first

  if (years.length === 0) {
    return <Title order={4}>No periods available</Title>;
  }

  const ratioOrder_liquidity = [
    'net_working_capital_ratio',
    'current_ratio',
    'quick_ratio',
    'cash_ratio',
  ];

  const ratioOrder_capital = [
    'debt_to_equity',
    'debt_to_total_capitalization',
    'total_assets_to_equity',
    'book_value',
    'tangible_book_value',
    'average_age_of_plant',
    'average_remaining_life_of_plant',
    'average_total_life_span_of_plant',
  ];

  const ratioOrder_operation = [
    'inventory_turnover',
    'receivables_ratio',
  ];

  const ratioOrder_earningsquality = [
    'operating_cash_flow_to_net_income',
    'capex_to_depreciation',
    'free_cash_flow',
  ];

  const ratioOrder_profitability = [
    'revenue',
    'gross_profit_margin',
    'operating_margin',
    'net_margin',
    'ebitda_margin',
    'sga_percent_of_revenue',
    'effective_tax_rate',
    'roa',
    'roe',
    'roic',
    'interest_coverage',
    'earnings_per_share',
  ];


  // const ratioOrder = [
  //   'net_working_capital_ratio',
  //   'current_ratio',
  //   'quick_ratio',
  //   'cash_ratio',
  //   'debt_to_equity',
  //   'debt_to_total_capitalization',
  //   'total_assets_to_equity',
  //   'book_value',
  //   'tangible_book_value',
  //   'Average Age of Plant',
  //   'Average Remaining Life of Plant',
  //   'Average Total Life Span of Plant',
  //   'inventory_turnover',
  //   'receivables_ratio',
  //   'operating_cash_flow_to_net_income',
  //   'capex_to_depreciation',
  //   'gross_profit_margin',
  //   'operating_margin',
  //   'net_margin',
  //   'ebitda_margin',
  //   'debt_to_equity',
  //   'debt_to_total_capitalization',
  //   'total_assets_to_equity',
  //   'return_on_equity',
  //   'return_on_assets',
  //   'return_on_invested_capital',
  //   'interest_coverage',
  //   'net_working_capital_ratio',
  // ];

  const firstPeriod = years[0];
  const firstRatios = firstCompany.periods[firstPeriod]?.ratios || {};

  // Function to get formatted value or empty string if missing
  const getFormattedValue = (company, year, ratioKey) => {
    try {
      return company.periods[year]?.ratios[ratioKey]?.formatted || '';
    } catch {
      return '';
    }
  };

  const getRatioEntry = (company, year, ratioKey) => {
    try {
      return company.periods[year]?.ratios[ratioKey] || null;
    } catch {
      return null;
    }
  };

  // YoY driver info only makes sense for a single-ticker view. When comparing
  // two or more tickers, suppress YoY and show formula/definition/components only.
  const hideYoy = companies.length > 1;

  // Calculate number of data columns
  const numDataCols = years.length * companies.length;

  const headerCells = [<th key="metric" style={{ width: '30%' }}>Metric</th>];

  years.forEach(year => {
    companies.forEach(company => {
      const colWidth = numDataCols > 0 ? `${70 / numDataCols}%` : 'auto';

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

  // Build table rows
  const rows_liquidity = ratioOrder_liquidity.map((ratioKey) => {

    const label = RATIO_LABELS[ratioKey] || firstRatios[ratioKey]?.label || ratioKey;
    const cells = [<Table.Td key="label" style={{ fontWeight: 500 }}>{label}</Table.Td>];

    years.forEach(year => {
      companies.forEach(company => {
        const entry = getRatioEntry(company, year, ratioKey);
        cells.push(
          <Table.Td key={`${company.ticker}-${year}`} style={{ textAlign: 'right' }}>
            <RatioTooltipCell formatted={entry?.formatted || ''} tooltip={entry?.tooltip} hideYoy={hideYoy} />
          </Table.Td>
        );
      });
    });

    return <Table.Tr key={ratioKey}>{cells}</Table.Tr>;
  });

  // Capital
  const rows_capital = ratioOrder_capital.map((ratioKey) => {

    const label = RATIO_LABELS[ratioKey] || firstRatios[ratioKey]?.label || ratioKey;
    const cells = [<Table.Td key="label" style={{ fontWeight: 500 }}>{label}</Table.Td>];

    years.forEach(year => {
      companies.forEach(company => {
        const entry = getRatioEntry(company, year, ratioKey);
        cells.push(
          <Table.Td key={`${company.ticker}-${year}`} style={{ textAlign: 'right' }}>
            <RatioTooltipCell formatted={entry?.formatted || ''} tooltip={entry?.tooltip} hideYoy={hideYoy} />
          </Table.Td>
        );
      });
    });

    return <Table.Tr key={ratioKey}>{cells}</Table.Tr>;
  });

  // Operating
  const rows_operating = ratioOrder_operation.map((ratioKey) => {

    const label = RATIO_LABELS[ratioKey] || firstRatios[ratioKey]?.label || ratioKey;
    const cells = [<Table.Td key="label" style={{ fontWeight: 500 }}>{label}</Table.Td>];

    years.forEach(year => {
      companies.forEach(company => {
        const entry = getRatioEntry(company, year, ratioKey);
        cells.push(
          <Table.Td key={`${company.ticker}-${year}`} style={{ textAlign: 'right' }}>
            <RatioTooltipCell formatted={entry?.formatted || ''} tooltip={entry?.tooltip} hideYoy={hideYoy} />
          </Table.Td>
        );
      });
    });

    return <Table.Tr key={ratioKey}>{cells}</Table.Tr>;
  });

  // Earnings Quality
  const rows_earnings_quality = ratioOrder_earningsquality.map((ratioKey) => {

    const label = RATIO_LABELS[ratioKey] || firstRatios[ratioKey]?.label || ratioKey;
    const cells = [<Table.Td key="label" style={{ fontWeight: 500 }}>{label}</Table.Td>];

    years.forEach(year => {
      companies.forEach(company => {
        const entry = getRatioEntry(company, year, ratioKey);
        cells.push(
          <Table.Td key={`${company.ticker}-${year}`} style={{ textAlign: 'right' }}>
            <RatioTooltipCell formatted={entry?.formatted || ''} tooltip={entry?.tooltip} hideYoy={hideYoy} />
          </Table.Td>
        );
      });
    });

    return <Table.Tr key={ratioKey}>{cells}</Table.Tr>;
  });

  // Profitability
  const rows_profitability = ratioOrder_profitability.map((ratioKey) => {

    const label = RATIO_LABELS[ratioKey] || firstRatios[ratioKey]?.label || ratioKey;
    const cells = [<Table.Td key="label" style={{ fontWeight: 500 }}>{label}</Table.Td>];

    years.forEach(year => {
      companies.forEach(company => {
        const entry = getRatioEntry(company, year, ratioKey);
        cells.push(
          <Table.Td key={`${company.ticker}-${year}`} style={{ textAlign: 'right' }}>
            <RatioTooltipCell formatted={entry?.formatted || ''} tooltip={entry?.tooltip} hideYoy={hideYoy} />
          </Table.Td>
        );
      });
    });

    return <Table.Tr key={ratioKey}>{cells}</Table.Tr>;
  });

  return (
    <div>
      <Title pt={25} order={3}>Ratio and Margin Analysis</Title>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>{headerCells}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows_liquidity}</Table.Tbody>
        <Table.Tbody>{rows_capital}</Table.Tbody>
        <Table.Tbody>{rows_operating}</Table.Tbody>
        <Table.Tbody>{rows_earnings_quality}</Table.Tbody>
        <Table.Tbody>{rows_profitability}</Table.Tbody>
      </Table>
    </div>
  );
};

export default FinancialComparisonTable