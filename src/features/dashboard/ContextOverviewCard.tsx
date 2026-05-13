import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import type { DashboardContextSummary } from '../../types';
import { SparklineArea } from '../../components/ui/SparklineArea';

interface ContextOverviewCardProps {
  summary: DashboardContextSummary;
}

const BUCKET_COLORS = ['#238636', '#3fb950', '#58a6ff', '#d29922', '#f85149'];

export function ContextOverviewCard({ summary }: ContextOverviewCardProps) {
  const fillSparkline = useMemo(
    () => summary.daily_avg_fill.map((p) => p.value),
    [summary.daily_avg_fill],
  );
  const cacheRateSparkline = useMemo(
    () => summary.daily_avg_cache_rate.map((p) => p.value * 100),
    [summary.daily_avg_cache_rate],
  );

  const maxBucketCount = useMemo(
    () => Math.max(...summary.fill_distribution.map((b) => b.session_count), 1),
    [summary.fill_distribution],
  );

  const avgFillPct = summary.avg_peak_fill_pct;
  const cacheHitPct = summary.avg_cache_hit_rate * 100;

  return (
    <div className="glass-card glow-cyan p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-accent-cyan" />
        <span className="text-[11px] font-medium text-[var(--text-secondary)] tracking-wide uppercase">
          Context &amp; Cache Overview
        </span>
      </div>

      <div className="flex gap-5">
        {/* Left — metric cards */}
        <div className="flex flex-col gap-2.5 flex-1 min-w-0">
          {/* Avg Context Fill */}
          <div className="flex items-center justify-between rounded-lg bg-[var(--bg-primary)]/40 px-3 py-2.5 gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-accent-cyan">
                {avgFillPct != null ? `${avgFillPct.toFixed(1)}%` : '--'}
              </div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">
                Avg Context Fill
              </div>
            </div>
            <div className="w-[60px] h-[24px] shrink-0">
              <SparklineArea data={fillSparkline} color="#22d3ee" fillOpacity={0.15} strokeWidth={1.5} />
            </div>
          </div>

          {/* Avg Cache Hit Rate */}
          <div className="flex items-center justify-between rounded-lg bg-[var(--bg-primary)]/40 px-3 py-2.5 gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-green-400">
                {`${cacheHitPct.toFixed(1)}%`}
              </div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">
                Avg Cache Hit Rate
              </div>
            </div>
            <div className="w-[60px] h-[24px] shrink-0">
              <SparklineArea data={cacheRateSparkline} color="#4ade80" fillOpacity={0.15} strokeWidth={1.5} />
            </div>
          </div>

          {/* Total Cache Savings */}
          <div className="flex items-center justify-between rounded-lg bg-[var(--bg-primary)]/40 px-3 py-2.5 gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-green-400">
                {`$${summary.total_cache_savings_usd.toFixed(4)}`}
              </div>
              <div className="text-[9px] text-[var(--text-secondary)] mt-0.5">
                Total Cache Savings
              </div>
              {summary.cache_savings_pct > 0 && (
                <div className="text-[9px] text-green-400/70 mt-0.5">
                  {summary.cache_savings_pct.toFixed(1)}% saved
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right — Context Fill Distribution */}
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[9px] font-medium text-[var(--text-secondary)] tracking-widest uppercase mb-2.5">
            Context Fill Distribution
          </span>
          <div className="flex flex-col gap-2 flex-1 justify-center">
            {summary.fill_distribution.map((bucket, i) => {
              const barWidthPct =
                bucket.session_count > 0
                  ? Math.max((bucket.session_count / maxBucketCount) * 100, 4)
                  : 0;
              const color = BUCKET_COLORS[i % BUCKET_COLORS.length];

              return (
                <div key={bucket.label} className="flex items-center gap-2">
                  <span className="text-[9px] text-[var(--text-secondary)] w-14 shrink-0 text-right">
                    {bucket.label}
                  </span>
                  <div className="flex-1 h-3 rounded-sm bg-[var(--bg-primary)]/40 overflow-hidden">
                    {bucket.session_count > 0 && (
                      <div
                        className="h-full rounded-sm transition-all duration-500"
                        style={{
                          width: `${barWidthPct}%`,
                          backgroundColor: color,
                          minWidth: 4,
                          opacity: 0.85,
                        }}
                      />
                    )}
                  </div>
                  <span className="text-[9px] text-[var(--text-secondary)] w-5 shrink-0 text-right">
                    {bucket.session_count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
