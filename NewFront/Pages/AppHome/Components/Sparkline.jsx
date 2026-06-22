const Sparkline = ({ values, width = 72, height = 22 }) => {
  const clean = (values || []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length < 2) return null;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const stepX = width / (clean.length - 1);

  const pts = clean.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastIdx = clean.length - 1;
  const lastX = lastIdx * stepX;
  const lastY = height - ((clean[lastIdx] - min) / range) * height;

  const trendUp = clean[lastIdx] >= clean[0];
  const stroke = trendUp ? 'hsl(var(--gain))' : 'hsl(var(--loss))';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(' ')}
      />
      <circle cx={lastX} cy={lastY} r="1.8" fill={stroke} />
    </svg>
  );
};

export default Sparkline;
