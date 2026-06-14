interface Props {
  points: number[];
  color: string;
  width?: number;
  height?: number;
}

/** A tiny inline line chart. Scales the series to fit and draws a smooth stroke + soft fill. */
export function Sparkline({ points, color, width = 96, height = 28 }: Props) {
  if (points.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fill = `${line} L${width},${height} L0,${height} Z`;
  const id = `spark-${color.replace("#", "")}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
