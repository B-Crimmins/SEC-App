export const UNIT_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'M', label: 'Millions' },
  { value: 'B', label: 'Billions' },
];

export const formatCurrency = (value, unit = 'auto', opts = {}) => {
  const { signed = false, decimals } = opts;
  if (value === null || value === undefined || Number.isNaN(value)) return '—';

  const negative = value < 0;
  const abs = Math.abs(value);
  const sign = negative ? '-' : signed && value > 0 ? '+' : '';

  const pick = (scale, suffix, defaultDp) => {
    const dp = typeof decimals === 'number' ? decimals : defaultDp;
    return `${sign}$${(abs / scale).toFixed(dp)}${suffix}`;
  };

  if (unit === 'B') return pick(1e9, 'B', 2);
  if (unit === 'M') return pick(1e6, 'M', 1);

  // auto
  if (abs >= 1e12) return pick(1e12, 'T', 2);
  if (abs >= 1e9) return pick(1e9, 'B', 2);
  if (abs >= 1e6) return pick(1e6, 'M', 2);
  if (abs >= 1e3) return pick(1e3, 'K', 2);
  return `${sign}$${abs.toFixed(typeof decimals === 'number' ? decimals : 0)}`;
};

export const formatPercent = (value, decimals = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
};
