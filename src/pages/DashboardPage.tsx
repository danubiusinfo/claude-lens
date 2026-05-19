import { useState, lazy, Suspense } from 'react';
import type { TimeRange } from '../types';
import { useDashboard } from '../hooks/useDashboard';
import { useHeatmap } from '../hooks/useHeatmap';
import { BentoSummary } from '../features/dashboard/BentoSummary';
import { DailyHeatmap } from '../features/dashboard/DailyHeatmap';
import { ProjectList } from '../features/dashboard/ProjectList';
import { TimeRangeSelector } from '../features/dashboard/TimeRangeSelector';
import { SourceStatusBadge } from '../features/dashboard/SourceStatusBadge';
import { GlassCard } from '../components/ui/GlassCard';
import { ErrorBanner } from '../components/ui/ErrorBanner';


const InputOutputChart = lazy(() => import('../features/dashboard/InputOutputChart'));

export function DashboardPage() {
  const [range, setRange] = useState<TimeRange>('WorkWeek');
  const { summary, tokenTimeseries, loading, error } =
    useDashboard(range);
  const heatmapData = useHeatmap('All');
  const hasData = summary && (summary.session_count > 0 || summary.total_tokens > 0);

  return (
    <div className="space-y-5">
      {/* Header with inline source status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
            Dashboard
          </h1>
          <SourceStatusBadge />
        </div>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      {error ? (
        <ErrorBanner message={error} />
      ) : loading ? (
        <GlassCard>
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
          </div>
        </GlassCard>
      ) : !hasData ? (
        <GlassCard>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-accent-cyan/10 flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-accent-cyan"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
              Waiting for data
            </h2>
            <p className="text-sm text-[var(--text-secondary)] max-w-md">
              No data found yet. ClaudeLens auto-imports from{' '}
              <code className="text-accent-cyan text-xs">~/.claude/history.jsonl</code>{' '}
              on startup. You can also trigger a manual import in{' '}
              <span className="text-accent-cyan">Settings</span>.
            </p>
          </div>
        </GlassCard>
      ) : (
        <>
          {/* Bento summary grid */}
          <BentoSummary summary={summary} tokenTimeseries={tokenTimeseries} range={range} />

          {/* Heatmap */}
          {heatmapData.error && <ErrorBanner message={heatmapData.error} />}
          <DailyHeatmap data={heatmapData.days} loading={heatmapData.loading} />

          {/* Charts */}
          <Suspense
            fallback={
              <GlassCard>
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                </div>
              </GlassCard>
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ProjectList />
              <InputOutputChart />
            </div>
          </Suspense>
        </>
      )}
    </div>
  );
}
