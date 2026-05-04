import { useEffect, useMemo, useState } from 'react';
import type { TimeRange, TimeseriesPoint } from '../../types';
import { getTokenTimeseries } from '../../lib/tauri';
import { useDashboardWorklog } from '../../hooks/useDashboardWorklog';
import { TimeRangeSelector } from './TimeRangeSelector';
import { ExpandedWidgetChart, type WidgetType } from './ExpandedWidgetChart';
import { fillGaps } from './timeseriesFill';

export type { WidgetType };

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

function Spinner() {
  return (
    <div
      className="absolute top-0 right-0 w-3 h-3 border-2 border-[var(--text-secondary)]/30 border-t-[var(--text-secondary)] rounded-full animate-spin"
      aria-label="Loading"
    />
  );
}

function TokensCostContent({ widgetType, range }: { widgetType: 'tokens' | 'cost'; range: TimeRange }) {
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTokenTimeseries(range)
      .then(s => { if (!cancelled) setSeries(s); })
      .catch(err => { if (!cancelled) console.error('dialog token fetch failed:', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const filled = useMemo(() => fillGaps(series, range), [series, range]);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {loading && <Spinner />}
      <ExpandedWidgetChart widgetType={widgetType} data={filled} />
    </div>
  );
}

function WorklogContent({ range }: { range: TimeRange }) {
  const { data: worklog, loading } = useDashboardWorklog(range);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {loading && <Spinner />}
      <ExpandedWidgetChart widgetType="worklog" data={[]} worklogData={worklog} />
    </div>
  );
}

export function ExpandedWidgetDialog({ widgetType, dashboardRange, onClose }: ExpandedWidgetDialogProps) {
  const [dialogRange, setDialogRange] = useState<TimeRange>(dashboardRange);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {TITLE[widgetType]}
        </span>
        <div className="flex items-center gap-2">
          <TimeRangeSelector value={dialogRange} onChange={setDialogRange} size="sm" />
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

      {widgetType === 'worklog' ? (
        <WorklogContent range={dialogRange} />
      ) : (
        <TokensCostContent widgetType={widgetType} range={dialogRange} />
      )}
    </div>
  );
}
