// Unit toggle drives every dollar value on the dashboard. The user picks
// the scale explicitly — no auto-detect, no per-row inference — so the
// numbers never carry a trailing 'M' / 'B' suffix.
export const UNIT_OPTIONS = [
  { value: 'M', label: 'Millions' },
  { value: 'B', label: 'Billions' },
];

export const formatCurrency = (value, unit = 'M', opts = {}) => {
  const { signed = false, decimals } = opts;
  if (value === null || value === undefined || Number.isNaN(value)) return '—';

  const negative = value < 0;
  const abs = Math.abs(value);
  const sign = negative ? '-' : signed && value > 0 ? '+' : '';

  const fmt = (n, dp) => n.toLocaleString('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });

  // The unit is selected globally by the user, so the suffix is redundant —
  // render scaled value with no 'M' / 'B' appended.
  const scale = unit === 'B' ? 1e9 : 1e6;
  const defaultDp = unit === 'B' ? 2 : 1;
  const dp = typeof decimals === 'number' ? decimals : defaultDp;
  return `${sign}$${fmt(abs / scale, dp)}`;
};

// Per-share values (EPS, dividends per share, book value per share) are in
// dollars-per-share, not raw dollars. Always render at 2-decimal precision
// and ignore the Millions/Billions unit toggle — scaling $1.50 by 1e6
// would otherwise read as "$0.0M".
export const formatPerShare = (value, opts = {}) => {
  const { signed = false } = opts;
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const negative = value < 0;
  const abs = Math.abs(value);
  const sign = negative ? '-' : signed && value > 0 ? '+' : '';
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatPercent = (value, decimals = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
};
