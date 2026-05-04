import { useEffect, useMemo, useState } from 'react';
import type { TimeRange, TimeseriesPoint, WorklogSummary } from '../../types';
import { getTokenTimeseries } from '../../lib/tauri';
import { useDashboardWorklog } from '../../hooks/useDashboardWorklog';
import { TimeRangeSelector } from './TimeRangeSelector';
import { ExpandedWidgetChart, type WidgetType } from './ExpandedWidgetChart';

interface ExpandedWidgetDialogProps {
  widgetType: WidgetType;
  dashboardRange: TimeRange;
  onClose: () => void;
}

const ZERO_POINT: Omit<TimeseriesPoint, 'date'> = {
  total: 0, input: 0, output: 0, cached: 0, reasoning: 0, cost: 0,
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDateRange(range: TimeRange): { start: Date; end: Date } {
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
      return { start: today, end: today };
  }
}

function fillBetween(data: TimeseriesPoint[], start: Date, end: Date): TimeseriesPoint[] {
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

function fillGaps(data: TimeseriesPoint[], range: TimeRange): TimeseriesPoint[] {
  if (range === 'All' && data.length > 0) {
    const start = new Date(data[0].date + 'T00:00:00');
    const end = new Date(data[data.length - 1].date + 'T00:00:00');
    return fillBetween(data, start, end);
  }
  if (range === 'Today') return data;
  const { start, end } = getDateRange(range);
  return fillBetween(data, start, end);
}

const TITLE: Record<WidgetType, string> = {
  tokens: 'Tokens',
  cost: 'Total Cost',
  worklog: 'Working time',
};

export function ExpandedWidgetDialog({
  widgetType,
  dashboardRange,
  onClose,
}: ExpandedWidgetDialogProps) {
  const [dialogRange, setDialogRange] = useState<TimeRange>(dashboardRange);

  const [tokenSeries, setTokenSeries] = useState<TimeseriesPoint[]>([]);
  const [tokenLoading, setTokenLoading] = useState(false);

  const needsTokens = widgetType === 'tokens' || widgetType === 'cost';

  useEffect(() => {
    if (!needsTokens) return;
    let cancelled = false;
    setTokenLoading(true);
    getTokenTimeseries(dialogRange)
      .then(series => {
        if (!cancelled) setTokenSeries(series);
      })
      .catch(err => {
        if (!cancelled) console.error('dialog token fetch failed:', err);
      })
      .finally(() => {
        if (!cancelled) setTokenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dialogRange, needsTokens]);

  const filled = useMemo(
    () => (needsTokens ? fillGaps(tokenSeries, dialogRange) : []),
    [tokenSeries, dialogRange, needsTokens],
  );

  const { data: worklog, loading: worklogLoading } = useDashboardWorklog(dialogRange);

  const isLoading = needsTokens ? tokenLoading : worklogLoading;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {TITLE[widgetType]}
        </span>
        <div className="flex items-center gap-2">
          <TimeRangeSelector value={dialogRange} onChange={setDialogRange} size="sm" />
          {isLoading && (
            <div className="w-3 h-3 border-2 border-[var(--text-secondary)]/30 border-t-[var(--text-secondary)] rounded-full animate-spin" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-7 h-7 flex items-center justify-center rounded-full
                       hover:bg-white/10 transition-colors text-[var(--text-secondary)]
                       hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
      </div>

      <ExpandedWidgetChart
        widgetType={widgetType}
        data={filled}
        worklogData={worklog as WorklogSummary | null | undefined}
      />
    </div>
  );
}
