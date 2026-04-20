import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import globalConfig from '../../../global/globalConfig.json';

const formatCurrency = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
};

const DCFAnalysis = ({ ticker, reportType, period }) => {
  const [dcfData, setDcfData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inputs, setInputs] = useState({
    discountRate: 0.10,
    interimGrowthRate: 0.05,
    terminalGrowthRate: 0.03,
    forecastPeriods: 5,
    stockPrice: 0,
  });

  const fetchDCFData = async () => {
    if (!ticker || !reportType || !period) {
      setError('Enter a ticker, report type, and year in the sidebar first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(
        globalConfig.appUrl + '/api/analysis/dcf',
        {
          ticker,
          report_type: reportType,
          period,
          discount_rate: inputs.discountRate,
          interim_growth_rate: inputs.interimGrowthRate,
          terminal_growth_rate: inputs.terminalGrowthRate,
          forecast_periods: inputs.forecastPeriods,
          stock_price: inputs.stockPrice,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessionStorage.getItem('token'),
          },
        }
      );
      setDcfData(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to calculate DCF');
      setDcfData(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run when the sidebar-driven inputs change, but not on every keystroke
  // of the DCF-specific inputs — those require clicking Recalculate.
  useEffect(() => {
    if (ticker && reportType && period) {
      fetchDCFData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, reportType, period]);

  const handleInputChange = (field, value) => {
    setInputs((prev) => ({
      ...prev,
      [field]: typeof value === 'number' ? value : parseFloat(value) || 0,
    }));
  };

  return (
    <Stack pt={25}>
      <Title order={3}>DCF Valuation</Title>
      <Text c="dimmed" size="sm">
        {ticker
          ? `${ticker} · ${reportType || '—'} · ${period || '—'}`
          : 'Enter a ticker, report type, and year in the sidebar to run a valuation.'}
      </Text>

      <Paper withBorder shadow="xs" p="md">
        <Title order={5} mb="sm">Valuation Parameters</Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <NumberInput
            label="Discount Rate"
            description="As a decimal (e.g. 0.10 = 10%)"
            value={inputs.discountRate}
            onChange={(v) => handleInputChange('discountRate', v)}
            step={0.01}
            decimalScale={4}
            min={0}
          />
          <NumberInput
            label="Interim Growth Rate"
            description="Per-period growth during forecast"
            value={inputs.interimGrowthRate}
            onChange={(v) => handleInputChange('interimGrowthRate', v)}
            step={0.01}
            decimalScale={4}
          />
          <NumberInput
            label="Terminal Growth Rate"
            description="Must be below discount rate"
            value={inputs.terminalGrowthRate}
            onChange={(v) => handleInputChange('terminalGrowthRate', v)}
            step={0.01}
            decimalScale={4}
          />
          <NumberInput
            label="Forecast Periods"
            description="Years to project"
            value={inputs.forecastPeriods}
            onChange={(v) => handleInputChange('forecastPeriods', v)}
            min={1}
            max={15}
            step={1}
            allowDecimal={false}
          />
          <NumberInput
            label="Stock Price"
            description="Current or target share price ($)"
            value={inputs.stockPrice}
            onChange={(v) => handleInputChange('stockPrice', v)}
            min={0}
            step={1}
            decimalScale={2}
            prefix="$"
            thousandSeparator=","
          />
        </SimpleGrid>
        <Group justify="flex-end" mt="md">
          <Button onClick={fetchDCFData} loading={loading}>
            Recalculate
          </Button>
        </Group>
      </Paper>

      {error && (
        <Paper withBorder p="md" style={{ borderColor: 'var(--mantine-color-red-5)' }}>
          <Text c="red">{error}</Text>
        </Paper>
      )}

      {dcfData && (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Paper withBorder shadow="xs" p="md">
            <Title order={5} mb="sm">Assumptions</Title>
            <Table>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>Discount Rate</Table.Td>
                  <Table.Td ta="right">{formatPercent(dcfData.discount_rate)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Interim Growth Rate</Table.Td>
                  <Table.Td ta="right">{formatPercent(dcfData.interim_growth_rate)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Terminal Growth Rate</Table.Td>
                  <Table.Td ta="right">{formatPercent(dcfData.terminal_growth_rate)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Forecast Periods</Table.Td>
                  <Table.Td ta="right">{dcfData.forecast_periods}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Latest Filing Year</Table.Td>
                  <Table.Td ta="right">{dcfData.latest_year}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Paper>

          <Paper withBorder shadow="xs" p="md">
            <Title order={5} mb="sm">Valuation Summary</Title>
            <Table>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>Terminal Value</Table.Td>
                  <Table.Td ta="right">{formatCurrency(dcfData.terminal_value)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Enterprise Value</Table.Td>
                  <Table.Td ta="right">{formatCurrency(dcfData.enterprise_value)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>Equity Value</Table.Td>
                  <Table.Td ta="right">{formatCurrency(dcfData.equity_value)}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Divider my="sm" />
            <Group justify="space-between">
              <Text fw={600}>Per Share Value</Text>
              <Text fw={700} c="teal">{formatCurrency(dcfData.per_share_value)}</Text>
            </Group>
          </Paper>

          <Paper withBorder shadow="xs" p="md" style={{ gridColumn: '1 / -1' }}>
            <Title order={5} mb="sm">Projected Free Cash Flow</Title>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Year</Table.Th>
                  <Table.Th ta="right">Projected FCF</Table.Th>
                  <Table.Th ta="right">Present Value</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(dcfData.projected_fcf || []).map((fcf, idx) => (
                  <Table.Tr key={idx}>
                    <Table.Td>{dcfData.latest_year + idx + 1}</Table.Td>
                    <Table.Td ta="right">{formatCurrency(fcf)}</Table.Td>
                    <Table.Td ta="right">{formatCurrency(dcfData.present_values?.[idx])}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </SimpleGrid>
      )}
    </Stack>
  );
};

export default DCFAnalysis;
