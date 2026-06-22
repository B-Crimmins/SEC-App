import { useState } from 'react';
import axios from 'axios';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle, IconPlayerPlay, IconScale, IconX } from '@tabler/icons-react';
import globalConfig from '../../../global/globalConfig.json';

const INDUSTRY_OPTIONS = [
  // Composite weights are methodology-dictated: debt/earnings/liquidity.
  { value: 'cyclical',    label: 'Capital-intensive cyclical', weights: [0.45, 0.35, 0.20] },
  { value: 'asset_light', label: 'Asset-light',                weights: [0.20, 0.50, 0.30] },
  { value: 'other',       label: 'Other (ask first)',          weights: null },
];

const PILLAR_DEFS = [
  {
    key: 'debt',
    label: 'Debt',
    submetrics: [
      { key: 'nd_ebitda',       label: 'Net debt / EBITDA',                 scoring: 'logistic' },
      { key: 'int_coverage',    label: 'EBIT / interest expense',           scoring: 'logistic' },
      { key: 'wa_maturity',     label: 'Weighted avg debt maturity (yrs)',  scoring: 'linear'   },
      { key: 'pct_fixed',       label: '% fixed-rate debt',                 scoring: 'linear'   },
    ],
  },
  {
    key: 'earnings_quality',
    label: 'Earnings quality',
    submetrics: [
      { key: 'cfo_ni',          label: 'CFO / Net Income (3y avg)',         scoring: 'linear' },
      { key: 'sloan',           label: 'Sloan accruals ratio',              scoring: 'linear' },
      { key: 'gm_cov',          label: 'Gross margin CoV (5y)',             scoring: 'linear' },
      { key: 'one_time_pct',    label: 'One-time items / pretax (3y, 2x weight)', scoring: 'linear' },
    ],
  },
  {
    key: 'liquidity',
    label: 'Liquidity',
    submetrics: [
      { key: 'cash_to_maturities', label: '(Cash + mkt sec) / NTM debt maturities', scoring: 'linear' },
      { key: 'revolver_share',     label: 'Unused revolver / total liquidity',      scoring: 'linear' },
      { key: 'trend_8q',           label: '8-quarter liquidity trend',              scoring: 'linear' },
    ],
  },
];

const NumberCell = ({ value, decimals = 2, suffix = '' }) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <Text c="dimmed" size="sm">N/A</Text>;
  }
  return <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(decimals)}{suffix}</Text>;
};

const ScoreCell = ({ score }) => {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return <Text c="dimmed" size="sm">—</Text>;
  }
  const color = score >= 70 ? 'teal' : score >= 40 ? 'yellow' : 'red';
  return (
    <Badge color={color} variant="light" radius="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {score.toFixed(0)}
    </Badge>
  );
};

const FlagBadge = ({ tone, children }) => (
  <Badge size="xs" variant="light" color={tone === 'warn' ? 'orange' : tone === 'assumed' ? 'yellow' : 'gray'}>
    {children}
  </Badge>
);

const ScorecardPortal = () => {
  const [industry, setIndustry] = useState('cyclical');
  const [tickers, setTickers] = useState([
    { id: 1, ticker: '' },
    { id: 2, ticker: '' },
  ]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const validTickers = tickers.map((t) => t.ticker.trim().toUpperCase()).filter(Boolean);

  const addTicker = () => {
    setTickers((prev) => {
      const nextId = Math.max(0, ...prev.map((t) => t.id)) + 1;
      return [...prev, { id: nextId, ticker: '' }];
    });
  };

  const removeTicker = (id) => {
    setTickers((prev) => (prev.length <= 2 ? prev : prev.filter((t) => t.id !== id)));
  };

  const setTickerAt = (id, value) => {
    setTickers((prev) => prev.map((t) => (t.id === id ? { ...t, ticker: value } : t)));
  };

  const runScorecard = async () => {
    if (validTickers.length < 2) {
      setError('Enter at least 2 tickers to build a peer scorecard.');
      return;
    }
    if (industry === 'other') {
      setError('Industry "Other" requires custom weights — ask first before defaulting to 0.35/0.35/0.30 per methodology.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(
        globalConfig.appUrl + '/api/analysis/peer-scorecard',
        {
          tickers: validTickers,
          industry_profile: industry,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessionStorage.getItem('token'),
          },
        }
      );
      setData(response.data);
    } catch (e) {
      setError(
        e.response?.status === 404
          ? 'Backend endpoint /api/analysis/peer-scorecard is not implemented yet. The scoring methodology requires data sources beyond the existing SEC service — see the README in this portal for the open questions.'
          : (e.response?.data?.detail || e.message || 'Failed to run scorecard.')
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const selectedWeights = INDUSTRY_OPTIONS.find((o) => o.value === industry)?.weights;

  return (
    <Container size="xl" py="md">
      {/* ----- Header ----- */}
      <Group gap="sm" align="center" mb="xs">
        <IconScale size={28} />
        <Title order={2}>Relative Valuation Portal</Title>
      </Group>
      <Text c="dimmed" mb="lg">
        Quantitative peer scorecard. Methodology: rank + non-linear absolute thresholds → pillar
        score (weighted mean − 0.5 × σ) → composite (industry-weighted). Tail-risk metrics use
        a logistic absolute score.
      </Text>

      {/* ----- Inputs ----- */}
      <Paper withBorder p="md" radius="md" mb="md">
        <Stack gap="md">
          <Box>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={6}>Industry profile</Text>
            <SegmentedControl
              fullWidth
              value={industry}
              onChange={setIndustry}
              data={INDUSTRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            {selectedWeights ? (
              <Text size="xs" c="dimmed" mt={6}>
                Composite weights — debt {selectedWeights[0]} · earnings {selectedWeights[1]} · liquidity {selectedWeights[2]}
              </Text>
            ) : (
              <Alert color="orange" icon={<IconAlertTriangle size={16} />} mt="sm" variant="light">
                Methodology requires confirmation before defaulting to 0.35/0.35/0.30 for "Other".
                Tell me the weights, or pick one of the two predefined profiles.
              </Alert>
            )}
          </Box>

          <Divider />

          <Box>
            <Group justify="space-between" align="baseline" mb={6}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">Peer tickers (≥ 2)</Text>
              <Text size="xs" c="dimmed">Separate from the main app's ticker inputs.</Text>
            </Group>
            <Stack gap="xs">
              {tickers.map((t, i) => (
                <Group key={t.id} gap="xs" wrap="nowrap">
                  <TextInput
                    placeholder={`Peer ${i + 1}`}
                    value={t.ticker}
                    onChange={(e) => setTickerAt(t.id, e.target.value)}
                    maxLength={6}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => removeTicker(t.id)}
                    disabled={tickers.length <= 2}
                    aria-label="Remove ticker"
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
            <Button variant="default" size="xs" mt="sm" onClick={addTicker}>
              + Add peer
            </Button>
          </Box>

          <Divider />

          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              Data window per methodology: 5 annual periods + 8 recent quarterly periods, primary
              sources only (10-K, 10-Q). Restatements flagged in output.
            </Text>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={runScorecard}
              loading={loading}
              disabled={validTickers.length < 2}
            >
              Run scorecard
            </Button>
          </Group>
        </Stack>
      </Paper>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="md" variant="light">
          {error}
        </Alert>
      )}

      {/* ----- Results: empty state ----- */}
      {!data && !loading && !error && (
        <Paper withBorder p="lg" radius="md">
          <Group gap="xs" mb="xs">
            <IconInfoCircle size={18} />
            <Title order={5}>Backend wiring pending</Title>
          </Group>
          <Text size="sm" c="dimmed" mb="sm">
            The frontend portal is in place. The scoring math is straightforward to implement
            once these methodology inputs are sourced — none of them ship in plain XBRL:
          </Text>
          <Stack gap={4} component="ul" style={{ paddingLeft: 18, margin: 0 }}>
            <li><Text size="sm">Unused revolver capacity (debt footnote / MD&A)</Text></li>
            <li><Text size="sm">Weighted-average debt maturity and % fixed-rate debt (debt schedule footnote)</Text></li>
            <li><Text size="sm">One-time items breakout (income statement footnote / non-GAAP reconciliation)</Text></li>
            <li><Text size="sm">12-month debt maturities (contractual obligations table)</Text></li>
            <li><Text size="sm">S&amp;P / Moody's industry threshold bands (external research)</Text></li>
            <li><Text size="sm">Historical default rate data and prevailing covenant levels (external)</Text></li>
          </Stack>
          <Text size="sm" c="dimmed" mt="sm">
            Until those are resolved, "Run scorecard" will hit a 404 on the unimplemented endpoint.
            See the chat for the open questions.
          </Text>
        </Paper>
      )}

      {/* ----- Results: structured output once data is wired ----- */}
      {data && (
        <Stack gap="md">
          {/* Composite ranking */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="sm">Composite ranking</Title>
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Rank</Table.Th>
                  <Table.Th>Ticker</Table.Th>
                  <Table.Th>Composite</Table.Th>
                  <Table.Th>Debt</Table.Th>
                  <Table.Th>Earnings quality</Table.Th>
                  <Table.Th>Liquidity</Table.Th>
                  <Table.Th>Flags</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(data.ranking || []).map((row, i) => (
                  <Table.Tr key={row.ticker}>
                    <Table.Td>{i + 1}</Table.Td>
                    <Table.Td fw={600}>{row.ticker}</Table.Td>
                    <Table.Td><ScoreCell score={row.composite} /></Table.Td>
                    <Table.Td><ScoreCell score={row.pillars?.debt} /></Table.Td>
                    <Table.Td><ScoreCell score={row.pillars?.earnings_quality} /></Table.Td>
                    <Table.Td><ScoreCell score={row.pillars?.liquidity} /></Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {(row.flags || []).map((f) => (
                          <FlagBadge key={f.code} tone={f.tone}>{f.label}</FlagBadge>
                        ))}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>

          {/* Per-pillar drill-down */}
          {PILLAR_DEFS.map((pillar) => (
            <Paper key={pillar.key} withBorder p="md" radius="md">
              <Title order={5} mb="xs">{pillar.label}</Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Sub-metric</Table.Th>
                    {validTickers.map((t) => (
                      <Table.Th key={t} style={{ textAlign: 'right' }}>{t}</Table.Th>
                    ))}
                    <Table.Th>Threshold source</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pillar.submetrics.map((sm) => {
                    const pillarData = data.pillars?.[pillar.key];
                    const row = pillarData?.submetrics?.[sm.key];
                    return (
                      <Table.Tr key={sm.key}>
                        <Table.Td>
                          {sm.label}{' '}
                          {sm.scoring === 'logistic' && (
                            <FlagBadge tone="info">logistic</FlagBadge>
                          )}
                        </Table.Td>
                        {validTickers.map((t) => (
                          <Table.Td key={t} style={{ textAlign: 'right' }}>
                            <Stack gap={2} align="flex-end">
                              <NumberCell value={row?.raw?.[t]} />
                              <ScoreCell score={row?.scores?.[t]} />
                            </Stack>
                          </Table.Td>
                        ))}
                        <Table.Td>
                          <Text size="xs" c="dimmed">{row?.threshold_source || '—'}</Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Paper>
          ))}

          {/* Sensitivity */}
          {data.sensitivity && (
            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="xs">Sensitivity</Title>
              <Text size="sm" c="dimmed" mb="sm">
                Pillar weights ±10pp, threshold midpoints ±20%. Listed below are
                the scenarios that flipped any peer pair.
              </Text>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Scenario</Table.Th>
                    <Table.Th>Flipped pair</Table.Th>
                    <Table.Th>Δ Composite</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(data.sensitivity.flips || []).map((f, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{f.scenario}</Table.Td>
                      <Table.Td>{f.swapped?.join(' ↔ ')}</Table.Td>
                      <Table.Td style={{ fontVariantNumeric: 'tabular-nums' }}>{f.delta?.toFixed(1)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          {/* Memo */}
          {data.memo && (
            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="xs">One-page memo</Title>
              {(data.memo.peers || []).map((p) => (
                <Box key={p.ticker} mb="sm">
                  <Text size="sm" fw={600}>{p.ticker} — top driver</Text>
                  <Text size="sm" c="dimmed">{p.top_driver}</Text>
                </Box>
              ))}
              {data.memo.sensitive_assumptions?.length > 0 && (
                <>
                  <Divider my="sm" />
                  <Text size="sm" fw={600} mb={4}>Two most sensitive assumptions</Text>
                  <Stack gap={4} component="ul" style={{ paddingLeft: 18, margin: 0 }}>
                    {data.memo.sensitive_assumptions.map((a, i) => (
                      <li key={i}><Text size="sm">{a}</Text></li>
                    ))}
                  </Stack>
                </>
              )}
            </Paper>
          )}

          {/* Appendix */}
          {data.appendix && (
            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="xs">Appendix — rank-flipping assumptions</Title>
              <Text size="xs" c="dimmed" mb="sm">
                Every assumption that, if changed within a reasonable range, would swap any two peers.
              </Text>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Assumption</Table.Th>
                    <Table.Th>Current</Table.Th>
                    <Table.Th>Range tested</Table.Th>
                    <Table.Th>Affected pair</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(data.appendix.assumptions || []).map((a, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{a.name}</Table.Td>
                      <Table.Td>{a.current}</Table.Td>
                      <Table.Td>{a.range}</Table.Td>
                      <Table.Td>{a.pair?.join(' ↔ ')}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}

          {/* Quality checks */}
          {data.quality_checks?.length > 0 && (
            <Paper withBorder p="md" radius="md">
              <Title order={5} mb="xs">Quality checks</Title>
              <Stack gap="xs">
                {data.quality_checks.map((q, i) => (
                  <Group key={i} gap="xs" align="flex-start">
                    <IconAlertTriangle size={16} style={{ marginTop: 2 }} />
                    <Box>
                      <Text size="sm" fw={500}>{q.title}</Text>
                      <Text size="xs" c="dimmed">{q.detail}</Text>
                    </Box>
                  </Group>
                ))}
              </Stack>
            </Paper>
          )}
        </Stack>
      )}
    </Container>
  );
};

export default ScorecardPortal;
