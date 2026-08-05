// Intrinsiq logo — circular ring of dots framing a central "I".
// Inline SVG so it picks up the parent's text color (use `color` prop
// or let it inherit via currentColor for light/dark theme).
import React from 'react';

const DOTS = 36;
const RING_R = 32;
const CX = 50;
const CY = 50;

// Pre-compute dot positions + radii once. Big at top/bottom (where
// |sin(angle)| ≈ 1), nearly invisible at the horizontal extremes
// (sides) so the ring reads as two crescent arcs flanking the "I".
const _dots = Array.from({ length: DOTS }, (_, i) => {
  const angle = (i / DOTS) * Math.PI * 2;
  const x = CX + RING_R * Math.cos(angle);
  const y = CY + RING_R * Math.sin(angle);
  const r = 0.3 + 2.7 * Math.abs(Math.sin(angle));
  return { x, y, r };
});

export const Logo = ({ size = 32, color = 'currentColor', className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Intrinsiq"
    role="img"
  >
    {_dots.map((d, i) => (
      <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={color} />
    ))}
    {/* Central "I" — bold geometric serif-less. */}
    <rect x={46} y={30} width={8} height={40} rx={0.5} fill={color} />
  </svg>
);

export default Logo;
