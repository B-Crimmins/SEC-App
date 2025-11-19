import React from 'react';
import { Table, Title } from '@mantine/core';

const FinancialComparisonTable = ({ data, selectedTickers }) => {
  const { peer_group_ratios } = data.calculated_ratios;

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

  const ratioOrder = [
    'revenue',
    'gross_profit_margin',
    'operating_margin',
    'net_margin',
    'ebitda_margin',
    'current_ratio',
    'quick_ratio',
    'cash_ratio',
    'debt_to_equity',
    'debt_to_total_capitalization',
    'total_assets_to_equity',
    'roe',
    'roa',
    'roic',
    'interest_coverage',
    'inventory_turnover',
    'receivables_ratio',
    'operating_cash_flow_to_net_income',
    'book_value',
    'tangible_book_value',
    'net_working_capital_ratio',
    'earnings_per_share'
  ];

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
  const rows = ratioOrder.map((ratioKey) => {

    const label = firstRatios[ratioKey]?.label || ratioKey;
    const cells = [<Table.Td key="label" style={{ fontWeight: 500 }}>{label}</Table.Td>];

    years.forEach(year => {
      companies.forEach(company => {
        const value = getFormattedValue(company, year, ratioKey);
        cells.push(<td key={`${company.ticker}-${year}`} style={{ textAlign: 'right' }}>{value}</td>);
      });
    });

    return <tr key={ratioKey}>{cells}</tr>;
  });

  return (
    <div>
      <Title pt={25} order={3}>Financial Ratios Comparison</Title>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>{headerCells}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </div>
  );
};

export default FinancialComparisonTable