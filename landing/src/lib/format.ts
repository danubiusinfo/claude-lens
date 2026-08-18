/** Token counts, abbreviated the way the app's dashboard abbreviates them. */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Smooth monotone path through evenly spaced values, normalised to the box. */
export function sparklinePath(
  values: readonly number[],
  width: number,
  height: number,
): string {
  if (values.length < 2) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((value, index) => ({
    x: index * step,
    y: height - ((value - min) / span) * height,
  }));

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const controlX = (previous.x + current.x) / 2;
    path += ` C ${controlX} ${previous.y} ${controlX} ${current.y} ${current.x} ${current.y}`;
  }
  return path;
}
