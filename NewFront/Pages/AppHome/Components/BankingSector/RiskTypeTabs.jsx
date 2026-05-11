import React from 'react';
import s from './BankingSector.module.css';

// Ordered list of risk_type values. Each becomes a tab; the active one is
// injected as a `risk_type` filter on every query, so all cards scope to it.
export const RISK_TYPES = [
  'Credit',
  'Tax',
  'Funding',
  'Market',
  'Capital',
  'Earnings',
  'Efficiency',
  'Off-Balance Sheet',
  'Counterparty',
  'Other',
];

export default function RiskTypeTabs({ active, onChange }) {
  return (
    <div className={s.tabs} role="tablist">
      {RISK_TYPES.map((rt) => (
        <button
          key={rt}
          type="button"
          role="tab"
          aria-selected={active === rt}
          className={`${s.tab} ${active === rt ? s.tabActive : ''}`}
          onClick={() => onChange(rt)}
        >
          {rt}
        </button>
      ))}
    </div>
  );
}
