import type { TimeseriesPoint, TimeRange } from '../../types';

export const ZERO_POINT: Omit<TimeseriesPoint, 'date'> = {
  total: 0, input: 0, output: 0, cached: 0, reasoning: 0, cost: 0,
};

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getDateRange(range: TimeRange): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'Today':
      return { start: today, end: today };
    case 'WorkWeek': {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((day + 6) % 7));
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      return { start: monday, end: friday > today ? today : friday };
    }
    case 'Week': {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { start, end: today };
    }
    case 'Month': {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return { start, end: today };
    }
    case 'All':
    default:
      return { start: today, end: today }; // only reached if a caller bypasses fillGaps's All-branch — kept as a safe fallback
  }
}

export function fillBetween(data: TimeseriesPoint[], start: Date, end: Date): TimeseriesPoint[] {
  const lookup = new Map(data.map(p => [p.date, p]));
  const result: TimeseriesPoint[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const key = toDateStr(cur);
    result.push(lookup.get(key) ?? { date: key, ...ZERO_POINT });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

export function fillGaps(data: TimeseriesPoint[], range: TimeRange): TimeseriesPoint[] {
  if (range === 'All' && data.length > 0) {
    const start = new Date(data[0].date + 'T00:00:00');
    const end = new Date(data[data.length - 1].date + 'T00:00:00');
    return fillBetween(data, start, end);
  }
  if (range === 'Today') return data;
  const { start, end } = getDateRange(range);
  return fillBetween(data, start, end);
}
