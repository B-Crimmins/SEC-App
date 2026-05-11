import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter, PieChart, Pie, Cell,
} from 'recharts';
import { comparePeriods, formatPeriod } from './metricMap';
import s from './BankingSector.module.css';

const PALETTE = [
  '#4c8dff', '#2dd4a0', '#f7b955', '#ff5577', '#b36ef5',
  '#4bd5ee', '#f08a3c', '#9ec5ff', '#5ee3b9', '#ffd08a',
];

const aliasOf = (m) => m.alias || `${m.agg}_${m.column}`;

const formatNumber = (v) => {
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

// Collapse one or more dimensions into a single display key joined by " · ".
// Recharts' X axis is one-dimensional, so multi-dim results get concatenated.
// reporting_period is formatted as `YYYY Q<n>` when it's one of the segments.
function labelFor(row, dims) {
  return dims
    .map((d) => {
      const v = row[d];
      if (v == null) return '∅';
      return d === 'reporting_period' ? formatPeriod(v) : v;
    })
    .join(' · ');
}

// BigQuery sorts reporting_period lexicographically — resort chronologically
// so line charts don't zig-zag across out-of-order dates.
function sortedByPeriod(rows, dimensions) {
  if (!dimensions.includes('reporting_period')) return rows;
  return [...rows].sort((a, b) => {
    const cmp = comparePeriods(a.reporting_period, b.reporting_period);
    if (cmp !== 0) return cmp;
    for (const d of dimensions) {
      if (d === 'reporting_period') continue;
      const av = String(a[d] ?? '');
      const bv = String(b[d] ?? '');
      if (av !== bv) return av < bv ? -1 : 1;
    }
    return 0;
  });
}

function TableView({ rows, dimensions, measures }) {
  const aliases = measures.map(aliasOf);
  const formatDim = (d, v) => {
    if (v == null) return '—';
    return d === 'reporting_period' ? formatPeriod(v) : v;
  };
  return (
    <div style={{ overflow: 'auto', maxHeight: 400 }}>
      <table className={s.table}>
        <thead>
          <tr>
            {dimensions.map((d) => <th key={d}>{d}</th>)}
            {aliases.map((a) => <th key={a} className={s.numCellHead}>{a}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {dimensions.map((d) => <td key={d}>{formatDim(d, r[d])}</td>)}
              {aliases.map((a) => (
                <td key={a} className={s.numCell}>{formatNumber(r[a])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Pivot a tall result into one row per primary dim with a column per series
// (2nd dim). Only used by bar/line/pie when there are exactly 2 dims.
function pivotSeries(rows, dimensions, measureAlias) {
  const [xDim, seriesDim] = dimensions;
  const formatX = (v) => (xDim === 'reporting_period' ? formatPeriod(v) : v);
  const xKeys = [];
  const xSet = new Set();
  const seriesKeys = [];
  const seriesSet = new Set();
  for (const r of rows) {
    const x = formatX(r[xDim]);
    const sk = r[seriesDim];
    if (!xSet.has(x)) { xSet.add(x); xKeys.push(x); }
    if (!seriesSet.has(sk)) { seriesSet.add(sk); seriesKeys.push(sk); }
  }
  const indexed = {};
  for (const x of xKeys) indexed[x] = { __x: x };
  for (const r of rows) {
    const x = formatX(r[xDim]);
    const sk = r[seriesDim];
    indexed[x][sk] = r[measureAlias];
  }
  return {
    data: xKeys.map((x) => indexed[x]),
    seriesKeys,
    xKey: '__x',
  };
}

function BarView({ rows, dimensions, measures }) {
  const aliases = measures.map(aliasOf);
  const data = useMemo(() => {
    if (dimensions.length === 2 && measures.length === 1) {
      return pivotSeries(rows, dimensions, aliases[0]);
    }
    return {
      data: rows.map((r) => ({ __x: labelFor(r, dimensions), ...r })),
      seriesKeys: aliases,
      xKey: '__x',
    };
  }, [rows, dimensions, aliases.join('|')]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="var(--bs-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey={data.xKey} stroke="var(--bs-text-dim)" tick={{ fontSize: 11 }} />
        <YAxis stroke="var(--bs-text-dim)" tick={{ fontSize: 11 }} tickFormatter={formatNumber} />
        <Tooltip
          contentStyle={{
            background: 'var(--bs-surface)',
            border: '1px solid var(--bs-border-strong)',
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(v) => formatNumber(v)}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {data.seriesKeys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineView({ rows, dimensions, measures }) {
  const aliases = measures.map(aliasOf);
  const data = useMemo(() => {
    if (dimensions.length === 2 && measures.length === 1) {
      return pivotSeries(rows, dimensions, aliases[0]);
    }
    return {
      data: rows.map((r) => ({ __x: labelFor(r, dimensions), ...r })),
      seriesKeys: aliases,
      xKey: '__x',
    };
  }, [rows, dimensions, aliases.join('|')]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="var(--bs-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey={data.xKey} stroke="var(--bs-text-dim)" tick={{ fontSize: 11 }} />
        <YAxis stroke="var(--bs-text-dim)" tick={{ fontSize: 11 }} tickFormatter={formatNumber} />
        <Tooltip
          contentStyle={{
            background: 'var(--bs-surface)',
            border: '1px solid var(--bs-border-strong)',
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(v) => formatNumber(v)}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {data.seriesKeys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function PieView({ rows, dimensions, measures }) {
  if (dimensions.length !== 1 || measures.length !== 1) {
    return <div className={s.renderNote}>Pie needs exactly 1 dim + 1 measure.</div>;
  }
  const dim = dimensions[0];
  const alias = aliasOf(measures[0]);
  const data = rows
    .map((r) => ({ name: String(r[dim] ?? '∅'), value: Number(r[alias]) || 0 }))
    .filter((d) => d.value > 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip formatter={(v) => formatNumber(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={110} label>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function ScatterView({ rows, dimensions, measures }) {
  if (measures.length < 2) {
    return <div className={s.renderNote}>Scatter needs 2 measures (x, y).</div>;
  }
  const [xAlias, yAlias] = measures.slice(0, 2).map(aliasOf);
  const data = rows.map((r) => ({
    x: Number(r[xAlias]) || 0,
    y: Number(r[yAlias]) || 0,
    label: dimensions.map((d) => r[d]).join(' · '),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid stroke="var(--bs-border)" strokeDasharray="2 4" />
        <XAxis
          dataKey="x"
          type="number"
          name={xAlias}
          stroke="var(--bs-text-dim)"
          tick={{ fontSize: 11 }}
          tickFormatter={formatNumber}
          label={{ value: xAlias, position: 'insideBottom', offset: -8, fill: 'var(--bs-text-dim)' }}
        />
        <YAxis
          dataKey="y"
          type="number"
          name={yAlias}
          stroke="var(--bs-text-dim)"
          tick={{ fontSize: 11 }}
          tickFormatter={formatNumber}
          label={{ value: yAlias, angle: -90, position: 'insideLeft', fill: 'var(--bs-text-dim)' }}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bs-surface)',
            border: '1px solid var(--bs-border-strong)',
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(v) => formatNumber(v)}
        />
        <Scatter data={data} fill={PALETTE[0]} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function KPIView({ rows, dimensions, measures }) {
  // Single aggregate(s) with no dimensions -> big-number tiles.
  const aliases = measures.map(aliasOf);
  const first = rows[0] || {};
  return (
    <div className={s.kpiGrid}>
      {aliases.map((a) => (
        <div key={a} className={s.kpiCard}>
          <div className={s.kpiLabel}>{a}</div>
          <div className={s.kpiValue}>{formatNumber(first[a])}</div>
        </div>
      ))}
    </div>
  );
}

const RENDERERS = {
  table: TableView,
  bar: BarView,
  line: LineView,
  pie: PieView,
  scatter: ScatterView,
  kpi: KPIView,
};

export const CHART_TYPES = [
  { value: 'table',   label: 'Table' },
  { value: 'bar',     label: 'Bar' },
  { value: 'line',    label: 'Line' },
  { value: 'pie',     label: 'Pie' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'kpi',     label: 'KPI' },
];

export default function ChartRenderer({ chartType, rows, dimensions, measures }) {
  const sorted = useMemo(
    () => sortedByPeriod(rows || [], dimensions),
    [rows, dimensions.join('|')]
  );
  if (!rows || rows.length === 0) {
    return <div className={s.renderNote}>No rows for the current spec.</div>;
  }
  if (measures.length === 0) {
    return <div className={s.renderNote}>Add at least one measure.</div>;
  }
  const Cmp = RENDERERS[chartType] || TableView;
  return <Cmp rows={sorted} dimensions={dimensions} measures={measures} />;
}
