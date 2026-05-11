import React, { useMemo, useState } from 'react';
import DimensionShelf from './DimensionShelf';
import MeasureShelf from './MeasureShelf';
import ScopeShelf from './ScopeShelf';
import ChartRenderer, { CHART_TYPES } from './ChartRenderer';
import { useQuery } from './useQuery';
import s from './BankingSector.module.css';

// A single configurable card. Each card owns its own `metrics` (required,
// maps to FFIEC's `short_description` column — the human-readable mapping
// of an MDRM code) and `entities` (optional, maps to `NM_LGL`). Global
// filters (risk_type tab + sidebar) merge in at query time.
export default function ChartCard({
  card,
  onChange,
  onRemove,
  dimensionOptions,
  measureColumns,
  aggregations,
  globalFilters,
}) {
  const [showSql, setShowSql] = useState(false);

  const metrics = card.metrics || [];
  const entities = card.entities || [];
  const hasMetric = metrics.length > 0;

  // When the user picks multiple metrics (= multiple distinct MDRM codes),
  // each one has its own unit/meaning — summing them is meaningless. Auto-
  // split by adding `short_description` as a dim so they render as separate
  // series. Same logic for entities: picking multiple entities implies
  // comparing them, so split by `NM_LGL`.
  const effectiveDimensions = useMemo(() => {
    const dims = [...(card.dimensions || [])];
    if (metrics.length > 1 && !dims.includes('short_description')) dims.push('short_description');
    if (entities.length > 1 && !dims.includes('NM_LGL')) dims.push('NM_LGL');
    return dims;
  }, [card.dimensions, metrics.length, entities.length]);

  // Scope for per-card distinct dropdowns: global filters + the OTHER
  // per-card selection. E.g. the entity list narrows to entities that exist
  // for the selected metrics, and vice versa.
  const metricScope = useMemo(() => {
    const out = { ...(globalFilters || {}) };
    if (entities.length) out.NM_LGL = entities;
    return out;
  }, [globalFilters, entities]);

  const entityScope = useMemo(() => {
    const out = { ...(globalFilters || {}) };
    if (metrics.length) out.short_description = metrics;
    return out;
  }, [globalFilters, metrics]);

  const spec = useMemo(() => {
    const cleanFilters = {};
    for (const [k, v] of Object.entries(globalFilters || {})) {
      if (Array.isArray(v) && v.length) cleanFilters[k] = v;
    }
    if (metrics.length) cleanFilters.short_description = metrics;
    if (entities.length) cleanFilters.NM_LGL = entities;
    return {
      dimensions: effectiveDimensions,
      measures: card.measures,
      filters: cleanFilters,
      order_by: card.orderBy || [],
      limit: card.limit || 10000,
    };
  }, [card, globalFilters, metrics, entities, effectiveDimensions]);

  const enabled = hasMetric && card.measures.length > 0;
  const { rows, sql, bytesProcessed, loading, error } = useQuery(spec, { enabled });

  const update = (patch) => onChange({ ...card, ...patch });

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <div className={s.cardHeadLeft}>
          <input
            className={s.cardTitleInput}
            value={card.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Untitled chart"
          />
          <span className={s.cardSub}>
            {!hasMetric ? 'pick a metric' :
              loading ? 'running…' :
                error ? 'error' :
                  `${rows.length.toLocaleString()} rows · ${(bytesProcessed / 1e6).toFixed(1)} MB`}
          </span>
        </div>
        <div className={s.cardHeadRight}>
          <select
            className={s.select}
            value={card.chartType}
            onChange={(e) => update({ chartType: e.target.value })}
          >
            {CHART_TYPES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <button
            type="button"
            className={s.iconBtn}
            title="Toggle SQL"
            onClick={() => setShowSql((v) => !v)}
          >SQL</button>
          <button
            type="button"
            className={s.iconBtn}
            title="Remove card"
            onClick={onRemove}
          >×</button>
        </div>
      </div>

      <div className={s.shelfGroup}>
        <ScopeShelf
          column="short_description"
          label="Metrics"
          required
          value={metrics}
          onChange={(v) => update({ metrics: v })}
          scopeFilters={metricScope}
        />
        <ScopeShelf
          column="NM_LGL"
          label="Entities"
          value={entities}
          onChange={(v) => update({ entities: v })}
          scopeFilters={entityScope}
        />
        <DimensionShelf
          value={card.dimensions}
          onChange={(v) => update({ dimensions: v })}
          options={dimensionOptions}
        />
        <MeasureShelf
          value={card.measures}
          onChange={(v) => update({ measures: v })}
          measureColumns={measureColumns}
          aggregations={aggregations}
        />
      </div>

      {showSql && (
        <pre className={s.sqlBlock}>{sql || '(no query yet)'}</pre>
      )}

      <div className={s.chartFlex}>
        {!hasMetric ? (
          <div className={s.renderNote}>
            Pick at least one metric to render this chart.
          </div>
        ) : error ? (
          <div className={`${s.alert} ${s.alertError}`}>{error}</div>
        ) : (
          <ChartRenderer
            chartType={card.chartType}
            rows={rows}
            dimensions={effectiveDimensions}
            measures={card.measures}
          />
        )}
      </div>
    </div>
  );
}
