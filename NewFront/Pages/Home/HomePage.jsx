import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Container,
  Grid,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconArrowRight,
  IconChartLine,
  IconFileAnalytics,
  IconLock,
  IconRobot,
  IconSearch,
  IconSparkles,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import classes from './homestyle.module.css';

// --- Demo data (NVIDIA — fiscal years, rounded for narrative clarity) ----------
const NVDA_PERIODS = ['FY22', 'FY23', 'FY24', 'FY25', 'FY26E'];
const NVDA_SERIES = {
  revenue:        [26.91, 26.97, 60.92, 130.50, 180.00],  // $B
  netIncome:      [9.75,  4.37,  29.76, 72.88,  95.20],   // $B
  grossMargin:    [64.9,  56.9,  72.7,  75.0,   75.5],    // %
  operatingMargin:[37.3,  15.7,  54.1,  62.4,   63.8],    // %
  eps:            [3.85,  1.74,  11.93, 29.17,  37.20],   // $
};

const PEER_SNAPSHOT = [
  { ticker: 'NVDA', rev: 130.50, revGrowth: 114.3, grossMargin: 75.0, opMargin: 62.4 },
  { ticker: 'AMD',  rev: 25.79,  revGrowth: 13.7,  grossMargin: 49.4, opMargin: 7.8  },
  { ticker: 'INTC', rev: 53.10,  revGrowth: -2.1,  grossMargin: 32.7, opMargin: -8.3 },
];

const METRIC_CARDS = [
  { key: 'revenue',         label: 'Revenue',          unit: '$B',  decimals: 1 },
  { key: 'netIncome',       label: 'Net Income',       unit: '$B',  decimals: 1 },
  { key: 'grossMargin',     label: 'Gross Margin',     unit: '%',   decimals: 1 },
  { key: 'operatingMargin', label: 'Operating Margin', unit: '%',   decimals: 1 },
];

const CHART_TOGGLES = [
  { label: 'Revenue',    value: 'revenue' },
  { label: 'Margins',    value: 'margins' },
  { label: 'EPS',        value: 'eps' },
];

// --- Small SVG sparkline --------------------------------------------------------
const Sparkline = ({ data, width = 120, height = 36, positive = true }) => {
  if (!data?.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(' ');
  const stroke = positive ? 'var(--mantine-color-gain-5)' : 'var(--mantine-color-loss-5)';
  const fill = positive ? 'rgba(47, 174, 110, 0.12)' : 'rgba(217, 66, 66, 0.12)';
  const areaPts = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polygon points={areaPts} fill={fill} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
};

// --- Primary line chart ---------------------------------------------------------
const LineChart = ({ periods, series, formatter }) => {
  const width = 720;
  const height = 260;
  const padX = 40;
  const padY = 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const stepX = plotW / (periods.length - 1);

  const colors = ['var(--mantine-color-intrinsiq-4)', 'var(--mantine-color-gain-5)', 'var(--mantine-color-loss-5)'];

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => padY + plotH * t);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', maxWidth: '100%' }}>
      {gridY.map((y, i) => (
        <line key={i} x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />
      ))}
      {periods.map((p, i) => (
        <text
          key={p}
          x={padX + i * stepX}
          y={height - 4}
          fontSize="11"
          fill="var(--mantine-color-gray-5)"
          textAnchor="middle"
        >
          {p}
        </text>
      ))}
      {series.map((s, sIdx) => {
        const pts = s.values
          .map((v, i) => `${padX + i * stepX},${padY + plotH - ((v - min) / range) * plotH}`)
          .join(' ');
        return (
          <g key={s.label}>
            <polyline points={pts} fill="none" stroke={colors[sIdx % colors.length]} strokeWidth="2.25" strokeLinejoin="round" />
            {s.values.map((v, i) => (
              <circle
                key={i}
                cx={padX + i * stepX}
                cy={padY + plotH - ((v - min) / range) * plotH}
                r="3"
                fill={colors[sIdx % colors.length]}
              />
            ))}
          </g>
        );
      })}
      {/* Legend */}
      <g transform={`translate(${padX}, 8)`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(${i * 110}, 0)`}>
            <rect width="10" height="10" y="2" fill={colors[i % colors.length]} rx="2" />
            <text x="16" y="11" fontSize="11" fill="var(--mantine-color-gray-3)">{s.label}</text>
          </g>
        ))}
      </g>
      {/* Y-axis hint */}
      <text x={padX - 6} y={padY + 4} fontSize="10" fill="var(--mantine-color-gray-6)" textAnchor="end">
        {formatter(max)}
      </text>
      <text x={padX - 6} y={height - padY} fontSize="10" fill="var(--mantine-color-gray-6)" textAnchor="end">
        {formatter(min)}
      </text>
    </svg>
  );
};

// --- Helpers --------------------------------------------------------------------
const pctChange = (arr) => {
  if (arr.length < 2) return 0;
  const prev = arr[arr.length - 2];
  const curr = arr[arr.length - 1];
  if (!prev) return 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const formatVal = (v, unit, decimals) => {
  if (unit === '$B') return `$${v.toFixed(decimals)}B`;
  if (unit === '%') return `${v.toFixed(decimals)}%`;
  if (unit === '$') return `$${v.toFixed(decimals)}`;
  return v.toFixed(decimals);
};

// --- Page sections --------------------------------------------------------------
const Hero = ({ onGetStarted }) => (
  <Box className={classes.hero}>
    <Container size="lg" py={80}>
      <Stack gap="lg" align="center" ta="center">
        <Badge size="lg" variant="light" color="intrinsiq" radius="sm">
          <Group gap={6}><IconSparkles size={14} /> AI-native fundamentals</Group>
        </Badge>
        <Title order={1} className={classes.heroTitle}>
          Data generation and analysis on both a single copmany and peer-to-peer basis
          <Text component="span" inherit className={classes.heroAccent}> in minutes</Text>
        </Title>
        <Text size="lg" c="dimmed" maw={680}>
          Intrinsiq pulls fundamentals straight from SEC filings, computes peer-adjusted ratios,
          and explains what changed — so you can spend your time deciding, not gathering.
        </Text>
        <Group gap="sm" mt="sm">
          <Button size="md" rightSection={<IconArrowRight size={16} />} onClick={onGetStarted}>
            Sign in to analyze any ticker
          </Button>
          <Button size="md" variant="default" component="a" href="#demo">
            See the NVDA demo
          </Button>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Free account required — no credit card to start.
        </Text>
      </Stack>
    </Container>
  </Box>
);

const MetricCard = ({ label, value, change, sparkData, unit, decimals }) => {
  const positive = change >= 0;
  return (
    <Paper withBorder p="md" radius="md" className={classes.metricCard}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.04em' }}>
        {label}
      </Text>
      <Group justify="space-between" align="flex-end" mt={6}>
        <Title order={2} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatVal(value, unit, decimals)}
        </Title>
        <Sparkline data={sparkData} positive={positive} />
      </Group>
      <Group gap={4} mt={6}>
        {positive
          ? <IconTrendingUp size={14} color="var(--mantine-color-gain-5)" />
          : <IconTrendingDown size={14} color="var(--mantine-color-loss-5)" />}
        <Text size="sm" c={positive ? 'gain.5' : 'loss.5'} fw={600}>
          {positive ? '+' : ''}{change.toFixed(1)}% YoY
        </Text>
        <Text size="sm" c="dimmed">· {NVDA_PERIODS.at(-2)} → {NVDA_PERIODS.at(-1)}</Text>
      </Group>
    </Paper>
  );
};

const DemoDashboard = ({ onGetStarted }) => {
  const [chartMode, setChartMode] = useState('revenue');

  const chartConfig = useMemo(() => {
    if (chartMode === 'revenue') {
      return {
        series: [{ label: 'Revenue ($B)', values: NVDA_SERIES.revenue }],
        formatter: (v) => `$${v.toFixed(0)}B`,
      };
    }
    if (chartMode === 'margins') {
      return {
        series: [
          { label: 'Gross Margin', values: NVDA_SERIES.grossMargin },
          { label: 'Operating Margin', values: NVDA_SERIES.operatingMargin },
        ],
        formatter: (v) => `${v.toFixed(0)}%`,
      };
    }
    return {
      series: [{ label: 'Diluted EPS ($)', values: NVDA_SERIES.eps }],
      formatter: (v) => `$${v.toFixed(0)}`,
    };
  }, [chartMode]);

  return (
    <Container size="lg" id="demo" py={60}>
      <Stack gap={6} mb="lg">
        <Group gap="xs">
          <Badge variant="light" color="gain" radius="sm">Live demo</Badge>
          <Text size="sm" c="dimmed">Powered by real SEC filings · NVIDIA Corporation (NVDA)</Text>
        </Group>
        <Title order={2}>How a full analysis looks in Intrinsiq</Title>
        <Text c="dimmed" maw={680}>
          This is the same view you get inside the app — just pre-loaded with NVDA.
          Sign in to run it on any US-listed ticker.
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mb="lg">
        {METRIC_CARDS.map((m) => (
          <MetricCard
            key={m.key}
            label={m.label}
            value={NVDA_SERIES[m.key].at(-1)}
            change={pctChange(NVDA_SERIES[m.key])}
            sparkData={NVDA_SERIES[m.key]}
            unit={m.unit}
            decimals={m.decimals}
          />
        ))}
      </SimpleGrid>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="sm">
              <Group gap="xs">
                <ThemeIcon variant="light" color="intrinsiq" radius="sm"><IconChartLine size={16} /></ThemeIcon>
                <Title order={4}>NVDA — 5-year trajectory</Title>
              </Group>
              <SegmentedControl
                size="xs"
                data={CHART_TOGGLES}
                value={chartMode}
                onChange={setChartMode}
              />
            </Group>
            <LineChart periods={NVDA_PERIODS} series={chartConfig.series} formatter={chartConfig.formatter} />
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md" radius="md" h="100%">
            <Group gap="xs" mb="xs">
              <ThemeIcon variant="light" color="gain" radius="sm"><IconSparkles size={16} /></ThemeIcon>
              <Title order={4}>What changed</Title>
            </Group>
            <Stack gap="sm" mt="xs">
              <WhatChangedItem
                tone="gain"
                title="Revenue accelerated +114% YoY"
                body="Data center segment drove the move — H100/H200 shipments into hyperscaler capex cycles."
              />
              <WhatChangedItem
                tone="gain"
                title="Operating margin expanded +830 bps"
                body="Mix shift toward high-margin accelerators outpaced opex growth."
              />
              <WhatChangedItem
                tone="neutral"
                title="Gross margin near structural ceiling"
                body="75.0% leaves limited upside — watch for ASP pressure from custom silicon."
              />
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      <Paper withBorder p="md" radius="md" mt="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Peer snapshot — most recent fiscal year</Title>
          <Badge variant="light" color="gray" radius="sm">NVDA vs AMD vs INTC</Badge>
        </Group>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ticker</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Revenue ($B)</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Revenue Growth</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Gross Margin</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Operating Margin</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {PEER_SNAPSHOT.map((p) => (
              <Table.Tr key={p.ticker}>
                <Table.Td fw={600}>{p.ticker}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ${p.rev.toFixed(1)}B
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <Text component="span" c={p.revGrowth >= 0 ? 'gain.5' : 'loss.5'} fw={600}>
                    {p.revGrowth >= 0 ? '+' : ''}{p.revGrowth.toFixed(1)}%
                  </Text>
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.grossMargin.toFixed(1)}%
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <Text component="span" c={p.opMargin >= 0 ? 'gain.5' : 'loss.5'} fw={600}>
                    {p.opMargin.toFixed(1)}%
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Group justify="center" mt="xl">
        <Button size="md" rightSection={<IconArrowRight size={16} />} onClick={onGetStarted}>
          Run this on your ticker
        </Button>
      </Group>
    </Container>
  );
};

const WhatChangedItem = ({ tone, title, body }) => {
  const color = tone === 'gain' ? 'gain.5' : tone === 'loss' ? 'loss.5' : 'gray.5';
  return (
    <Box style={{ borderLeft: `2px solid var(--mantine-color-${tone === 'neutral' ? 'gray-6' : tone + '-5'})`, paddingLeft: 12 }}>
      <Text size="sm" fw={600} c={color}>{title}</Text>
      <Text size="xs" c="dimmed" mt={2}>{body}</Text>
    </Box>
  );
};

const FEATURES = [
  {
    icon: IconFileAnalytics,
    title: 'Fundamentals from primary source',
    body: 'Every number links back to the SEC filing it came from. No scraped aggregators, no vendor reconciliation.',
  },
  {
    icon: IconChartLine,
    title: 'Peer-group ratios, explained',
    body: 'Twenty-eight standardized ratios with hover-to-see formulas, definitions, and YoY driver attribution.',
  },
  {
    icon: IconRobot,
    title: 'AI that reads the 10-K for you',
    body: 'Management discussion summarized into what actually changed — risks, drivers, and guidance shifts.',
  },
  {
    icon: IconSearch,
    title: 'Revenue segments by geography & product',
    body: 'XBRL-parsed segment tables across periods, so you can see where growth really came from.',
  },
];

const FeatureStrip = () => (
  <Box className={classes.featureStrip}>
    <Container size="lg" py={60}>
      <Stack gap="xs" mb="lg">
        <Title order={2}>Built for analysts who have to show their work</Title>
        <Text c="dimmed" maw={680}>
          No black boxes. Every ratio, segment breakdown, and AI summary is traceable to the filing it came from.
        </Text>
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {FEATURES.map((f) => (
          <Paper key={f.title} withBorder p="md" radius="md">
            <Group gap="sm" align="flex-start">
              <ThemeIcon variant="light" color="intrinsiq" size={38} radius="md">
                <f.icon size={20} />
              </ThemeIcon>
              <Box>
                <Text fw={600} mb={4}>{f.title}</Text>
                <Text size="sm" c="dimmed">{f.body}</Text>
              </Box>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
    </Container>
  </Box>
);

const WorkflowStrip = () => (
  <Container size="lg" py={60}>
    <Stack gap="xs" mb="lg">
      <Title order={2}>From ticker to thesis in three steps</Title>
      <Text c="dimmed" maw={680}>
        The stack that used to take a junior analyst a week — compressed into a workflow.
      </Text>
    </Stack>
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
      {[
        { n: '01', t: 'Search any US-listed ticker', b: 'Intrinsiq pulls the latest 10-K and 10-Q straight from EDGAR.' },
        { n: '02', t: 'See fundamentals + ratios + segments', b: 'Three years of IS, BS, CF — plus peer-adjusted ratios and revenue segments by geography & product.' },
        { n: '03', t: 'Ask the AI what to pay attention to', b: 'Summary of what changed, risks flagged in the filing, and DCF sanity checks.' },
      ].map((s) => (
        <Paper key={s.n} withBorder p="lg" radius="md">
          <Text className={classes.stepNum}>{s.n}</Text>
          <Text fw={600} mt="xs">{s.t}</Text>
          <Text size="sm" c="dimmed" mt={4}>{s.b}</Text>
        </Paper>
      ))}
    </SimpleGrid>
  </Container>
);

const FinalCTA = ({ onGetStarted }) => (
  <Box className={classes.finalCta}>
    <Container size="md" py={80}>
      <Stack gap="md" align="center" ta="center">
        <ThemeIcon size={52} radius="xl" variant="light" color="intrinsiq">
          <IconLock size={24} />
        </ThemeIcon>
        <Title order={2}>Ready to analyze your own tickers?</Title>
        <Text c="dimmed" maw={560}>
          Sign in (free) to move past the NVDA demo and run Intrinsiq on any US-listed company.
          Paid plans unlock peer comparisons, DCF, and segment-level history — but the basics
          are yours without a credit card.
        </Text>
        <Group gap="sm" mt="sm">
          <Button size="md" rightSection={<IconArrowRight size={16} />} onClick={onGetStarted}>
            Create a free account
          </Button>
          <Button size="md" variant="default" onClick={onGetStarted}>
            Log in
          </Button>
        </Group>
      </Stack>
    </Container>
  </Box>
);

const Footer = () => (
  <Box className={classes.footer}>
    <Container size="lg" py="lg">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">© {new Date().getFullYear()} Intrinsiq</Text>
        <Text size="xs" c="dimmed">
          Data sourced from SEC EDGAR. Not investment advice.
        </Text>
      </Group>
    </Container>
  </Box>
);

const HomePage = () => {
  const navigate = useNavigate();
  const goLogin = () => navigate('/login');

  return (
    <div className={classes.root}>
      <Hero onGetStarted={goLogin} />
      <DemoDashboard onGetStarted={goLogin} />
      <FeatureStrip />
      <WorkflowStrip />
      <FinalCTA onGetStarted={goLogin} />
      <Footer />
    </div>
  );
};

export default HomePage;
