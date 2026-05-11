import React, { useMemo, useState } from 'react';
import { useMantineColorScheme } from '@mantine/core';
import FilterSidebar from './FilterSidebar';
import ChartCard from './ChartCard';
import RiskTypeTabs, { RISK_TYPES } from './RiskTypeTabs';
import { useFFIECSchema } from './useFFIECSchema';
import s from './BankingSector.module.css';

let _cardId = 0;
const nextId = () => `card-${++_cardId}`;

// MDRM values are pre-aggregated at the (entity, period, code) grain. Summing
// across MDRMs within a period gives "total of selected metrics per period";
// summing across periods gives a cumulative total; averaging across periods
// gives a per-period mean. Those are the only two aggregations that make
// semantic sense on this dataset.
const ALLOWED_AGGS = ['sum', 'avg'];

// Time-series-first defaults: each card groups by reporting_period so values
// always land on a time axis. `metrics` and `entities` start empty — metric
// is required (card renders a prompt until one is picked) and the user may
// add one-or-many of each per chart. When >1 metric/entity is picked,
// ChartCard auto-splits by that column so heterogeneous series never get
// summed into a single line. `metrics` maps to `short_description` — the
// human-readable mapping of an MDRM code.
const defaultCards = () => [
  {
    id: nextId(),
    title: 'Total by period',
    chartType: 'line',
    metrics: [],
    entities: [],
    dimensions: ['reporting_period'],
    measures: [{ column: 'int_data', agg: 'sum', alias: 'sum_int_data' }],
  },
  {
    id: nextId(),
    title: 'By statement bucket',
    chartType: 'bar',
    metrics: [],
    entities: [],
    dimensions: ['reporting_period', 'statement_bucket'],
    measures: [{ column: 'int_data', agg: 'sum', alias: 'sum_int_data' }],
  },
];

const blankCard = () => ({
  id: nextId(),
  title: 'New chart',
  chartType: 'line',
  metrics: [],
  entities: [],
  dimensions: ['reporting_period'],
  measures: [{ column: 'int_data', agg: 'sum', alias: 'sum_int_data' }],
});

export default function BankingSector() {
  const [filters, setFilters] = useState({});
  const [activeRiskType, setActiveRiskType] = useState(RISK_TYPES[0]);
  const [cards, setCards] = useState(defaultCards);

  const { schema, error: schemaError } = useFFIECSchema();
  const { colorScheme } = useMantineColorScheme();
  const theme = colorScheme === 'light' ? 'light' : 'dark';

  const updateCard = (id, next) =>
    setCards((cs) => cs.map((c) => (c.id === id ? next : c)));
  const removeCard = (id) =>
    setCards((cs) => cs.filter((c) => c.id !== id));
  const addCard = () => setCards((cs) => [...cs, blankCard()]);

  // Risk type is set by the top tabs, not the sidebar — merge it into the
  // filter set on the way out so every card inherits the active tab's scope.
  const effectiveFilters = useMemo(
    () => ({ ...filters, risk_type: [activeRiskType] }),
    [filters, activeRiskType]
  );

  // Hide risk_type (tab-pinned) and the two per-card scoped columns
  // (`short_description`, `NM_LGL`) from the generic DimensionShelf —
  // they're managed by each card's ScopeShelves and auto-injected as
  // splitting dims when the user picks more than one. Surfacing them in
  // the dim menu too would just let users double-add them.
  const dimensionOptions = useMemo(
    () => (schema?.dimensions || []).filter(
      (d) => d !== 'risk_type' && d !== 'short_description' && d !== 'NM_LGL'
    ),
    [schema]
  );
  const measureColumns = schema?.measures || [];

  return (
    <div className={s.root} data-theme={theme}>
      <header className={s.header}>
        <h2 className={s.title}>
          Banking Sector
          <span className={s.titleAccent}>— FFIEC Explorer</span>
        </h2>
        {schema && (
          <span className={s.cardSub}>
            {schema.row_count?.toLocaleString()} rows · {schema.columns.length} columns
          </span>
        )}
      </header>

      <RiskTypeTabs active={activeRiskType} onChange={setActiveRiskType} />

      <div className={s.layout}>
        <FilterSidebar
          filters={filters}
          setFilters={setFilters}
          onReset={() => setFilters({})}
          forcedFilters={{ risk_type: [activeRiskType] }}
        />

        <div className={s.canvas}>
          {schemaError && (
            <div className={`${s.alert} ${s.alertError}`}>{schemaError}</div>
          )}
          {!schema && !schemaError && (
            <div className={s.loading}>
              <div className={s.spinner} />
              <span>Loading FFIEC schema…</span>
            </div>
          )}
          {schema && (
            <>
              <div className={s.cardsGrid}>
                {cards.map((card) => (
                  <ChartCard
                    key={card.id}
                    card={card}
                    onChange={(next) => updateCard(card.id, next)}
                    onRemove={() => removeCard(card.id)}
                    dimensionOptions={dimensionOptions}
                    measureColumns={measureColumns}
                    aggregations={ALLOWED_AGGS}
                    globalFilters={effectiveFilters}
                  />
                ))}
              </div>
              <button type="button" className={s.addCardBtn} onClick={addCard}>
                + Add chart
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
