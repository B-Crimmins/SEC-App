// Chronological comparator for MM/DD/YYYY period strings.
export function comparePeriods(a, b) {
  const [ma, da, ya] = a.split('/').map(Number);
  const [mb, db, yb] = b.split('/').map(Number);
  return ya - yb || ma - mb || da - db;
}

// Pretty-print a period as "YYYY Q<n>" if it's a quarter-end date.
export function formatPeriod(p) {
  if (!p) return '';
  const [m, d, y] = p.split('/');
  const mm = Number(m);
  const quarter = { 3: 1, 6: 2, 9: 3, 12: 4 }[mm];
  if (quarter && Number(d) >= 28) return `${y} Q${quarter}`;
  return `${mm}/${d}/${y}`;
}
