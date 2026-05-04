import { memo, useMemo } from 'react';

interface SparklineAreaProps {
  data: number[];
  color: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

function buildPath(data: number[]): { line: string; area: string } | null {
  if (data.length < 2) return null;

  const maxY = Math.max(...data);
  const minY = Math.min(...data);
  if (maxY === minY) return null;

  const w = 100;
  const h = 40;
  const stepX = w / (data.length - 1);

  const points = data.map((v, i) => ({
    x: i * stepX,
    y: h - ((v - minY) / (maxY - minY)) * h,
  }));

  // Smooth cubic bezier path (monotone spline)
  let line = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    line += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  const area = `${line} L${w},${h} L0,${h} Z`;
  return { line, area };
}

/** Flat line at the bottom — used as the "from" shape for enter animations. */
function buildFlatPath(pointCount: number): { line: string; area: string } {
  const w = 100;
  const h = 40;
  const stepX = w / Math.max(pointCount - 1, 1);

  let line = `M0,${h}`;
  for (let i = 1; i < pointCount; i++) {
    const x = i * stepX;
    line += ` C${x - stepX * 0.5},${h} ${x - stepX * 0.5},${h} ${x},${h}`;
  }

  const area = `${line} L${w},${h} L0,${h} Z`;
  return { line, area };
}

const TRANSITION = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';

export const SparklineArea = memo(function SparklineArea({
  data,
  color,
  fillOpacity = 0.15,
  strokeWidth = 1.5,
}: SparklineAreaProps) {
  const paths = useMemo(() => buildPath(data), [data]);
  const flat = useMemo(() => buildFlatPath(data.length), [data.length]);

  // Always render the SVG so CSS can transition the `d` property.
  // When there's no real data, show the flat baseline (invisible but keeps DOM stable).
  const display = paths ?? flat;
  const isFlat = !paths;

  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="w-full h-full"
      style={{ transition: 'opacity 0.6s ease', opacity: isFlat ? 0 : 1 }}
    >
      <path
        d={display.area}
        fill={color}
        opacity={fillOpacity}
        style={{ transition: TRANSITION }}
      />
      <path
        d={display.line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.4}
        vectorEffect="non-scaling-stroke"
        style={{ transition: TRANSITION }}
      />
    </svg>
  );
});
