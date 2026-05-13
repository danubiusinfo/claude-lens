import { useState } from 'react';
import { ChevronRight, Activity } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import type { SessionContextStats } from '../../types';
import { useChartColors } from '../../hooks/useChartColors';

interface ContextMonitorProps {
  stats: SessionContextStats;
}

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export function ContextMonitor({ stats }: ContextMonitorProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = useChartColors();

  if (stats.turns.length === 0) return null;

  const { context_limit, peak_input_tokens, peak_fill_pct, avg_fill_pct, cache_hit_rate, cache_savings_usd, compaction_count, turns } = stats;

  // Gauge bar fill percentage (capped at 100 for display)
  const gaugePct = context_limit && context_limit > 0
    ? Math.min(100, (peak_input_tokens / context_limit) * 100)
    : null;

  const isHigh = gaugePct !== null && gaugePct > 90;

  // Gradient stops for gauge bar
  const gaugeGradient = isHigh
    ? 'from-green-400 via-blue-400 via-yellow-400 to-red-500'
    : 'from-green-400 via-blue-400 to-yellow-400';

  // Label for gauge
  const gaugeLabel = context_limit && context_limit > 0
    ? `${formatTokensShort(peak_input_tokens)} / ${formatTokensShort(context_limit)} (${Math.round(gaugePct ?? 0)}%)`
    : `${formatTokensShort(peak_input_tokens)} peak`;

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    backdropFilter: 'blur(40px) saturate(180%)',
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: '12px',
    fontSize: '12px',
    color: colors.tooltipText,
    boxShadow: colors.tooltipShadow,
  };

  // Compaction turn x-values for reference lines
  const compactionTurns = turns.filter((t) => t.is_compaction).map((t) => t.turn);

  return (
    <section className="glass-card glow-cyan space-y-2.5 px-5 py-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-accent-cyan">
          <Activity size={15} strokeWidth={2} aria-hidden />
          Context Monitor
        </span>
        <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
          {expanded ? 'Hide details' : 'Show details'}
          <ChevronRight
            size={14}
            strokeWidth={2}
            aria-hidden
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </span>
      </button>

      {/* Gauge bar */}
      <div className="space-y-1">
        <div className="relative h-2.5 rounded-full bg-[var(--bg-primary)]/60 overflow-hidden">
          {gaugePct !== null ? (
            <div
              className={`h-full rounded-full bg-gradient-to-r ${gaugeGradient}`}
              style={{ width: `${gaugePct}%` }}
            />
          ) : (
            <div
              className="h-full rounded-full bg-accent-cyan/60"
              style={{ width: '100%' }}
            />
          )}
        </div>
        <div className="text-center text-[11px] text-[var(--text-secondary)]">
          {gaugeLabel}
        </div>
      </div>

      {/* Summary stats row (collapsed) */}
      <div className="flex gap-2">
        <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
          <div className="text-[10px] text-[var(--text-secondary)] leading-none mb-0.5">Peak fill</div>
          <div className="text-sm font-semibold text-accent-cyan">
            {peak_fill_pct !== null ? `${Math.round(peak_fill_pct)}%` : '—'}
          </div>
        </div>
        <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
          <div className="text-[10px] text-[var(--text-secondary)] leading-none mb-0.5">Cache hit</div>
          <div className="text-sm font-semibold text-green-400">
            {`${Math.round(cache_hit_rate * 100)}%`}
          </div>
        </div>
        <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
          <div className="text-[10px] text-[var(--text-secondary)] leading-none mb-0.5">Compactions</div>
          <div className="text-sm font-semibold text-orange-400">
            {compaction_count}
          </div>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <>
          {/* AreaChart */}
          <div className="rounded-lg bg-[var(--bg-primary)]/40 p-3">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={turns}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="grad-ctx-input" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="grad-ctx-cache" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ade80" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#4ade80" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="turn"
                  stroke={colors.axis}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Turn', position: 'insideBottomRight', offset: -4, fontSize: 10, fill: colors.axis }}
                />
                <YAxis
                  tickFormatter={formatTokensShort}
                  stroke={colors.axis}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => `Turn ${label}`}
                  formatter={(value, name) => {
                    const v = typeof value === 'number' ? value : 0;
                    if (name === 'input_tokens') return [formatTokensShort(v), 'Input'];
                    if (name === 'cache_read_tokens') return [formatTokensShort(v), 'Cache read'];
                    if (name === 'output_tokens') return [formatTokensShort(v), 'Output'];
                    return [formatTokensShort(v), String(name)];
                  }}
                  cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
                />

                {/* Context limit reference line */}
                {context_limit !== null && context_limit > 0 && (
                  <ReferenceLine
                    y={context_limit}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: 'Limit', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
                  />
                )}

                {/* Compaction vertical lines */}
                {compactionTurns.map((turn) => (
                  <ReferenceLine
                    key={`compact-${turn}`}
                    x={turn}
                    stroke="#fb923c"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                ))}

                {/* Hidden output area — only for tooltip */}
                <Area
                  type="monotone"
                  dataKey="output_tokens"
                  stroke="transparent"
                  fill="transparent"
                  dot={false}
                  activeDot={false}
                  legendType="none"
                />

                {/* Cache read area (below input) */}
                <Area
                  type="monotone"
                  dataKey="cache_read_tokens"
                  name="cache_read_tokens"
                  stroke="#4ade80"
                  strokeWidth={1.5}
                  fill="url(#grad-ctx-cache)"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 1.5, stroke: '#4ade80', fill: 'var(--bg-primary)' }}
                />

                {/* Total input area */}
                <Area
                  type="monotone"
                  dataKey="input_tokens"
                  name="input_tokens"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fill="url(#grad-ctx-input)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#38bdf8', fill: 'var(--bg-primary)' }}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-2 px-1">
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                <span className="w-3 h-0.5 rounded bg-[#38bdf8] inline-block" />
                Input tokens
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                <span className="w-3 h-0.5 rounded bg-[#4ade80] inline-block" />
                Cache read
              </span>
              {context_limit !== null && context_limit > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                  <span className="w-3 h-0.5 rounded border-t border-dashed border-red-500 inline-block" />
                  Context limit
                </span>
              )}
              {compactionTurns.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                  <span className="w-0.5 h-3 rounded border-l border-dashed border-orange-400 inline-block" />
                  Compaction
                </span>
              )}
            </div>
          </div>

          {/* Extended stat cards */}
          <div className="grid grid-cols-5 gap-1.5">
            <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-[10px] text-[var(--text-secondary)] leading-none mb-0.5">Peak fill</div>
              <div className="text-sm font-semibold text-accent-cyan">
                {peak_fill_pct !== null ? `${Math.round(peak_fill_pct)}%` : '—'}
              </div>
            </div>
            <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-[10px] text-[var(--text-secondary)] leading-none mb-0.5">Avg fill</div>
              <div className="text-sm font-semibold text-accent-cyan">
                {avg_fill_pct !== null ? `${Math.round(avg_fill_pct)}%` : '—'}
              </div>
            </div>
            <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-[10px] text-[var(--text-secondary)] leading-none mb-0.5">Cache hit</div>
              <div className="text-sm font-semibold text-green-400">
                {`${Math.round(cache_hit_rate * 100)}%`}
              </div>
            </div>
            <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-[10px] text-[var(--text-secondary)] leading-none mb-0.5">Cache saved</div>
              <div className="text-sm font-semibold text-green-400">
                {cache_savings_usd > 0
                  ? cache_savings_usd < 0.01
                    ? '<$0.01'
                    : `$${cache_savings_usd.toFixed(2)}`
                  : '$0.00'}
              </div>
            </div>
            <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-[10px] text-[var(--text-secondary)] leading-none mb-0.5">Compactions</div>
              <div className="text-sm font-semibold text-orange-400">
                {compaction_count}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
