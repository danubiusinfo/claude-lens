import { useEffect, useMemo, useState } from 'react';
import type { TimeRange, TimeseriesPoint, WorklogSummary } from '../../types';
import { getTokenTimeseries } from '../../lib/tauri';
import { useDashboardWorklog } from '../../hooks/useDashboardWorklog';
import { TimeRangeSelector } from './TimeRangeSelector';
import { ExpandedWidgetChart, type WidgetType } from './ExpandedWidgetChart';
import { fillGaps } from './timeseriesFill';

interface ExpandedWidgetDialogProps {
  widgetType: WidgetType;
  dashboardRange: TimeRange;
  onClose: () => void;
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
