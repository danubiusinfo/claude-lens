import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import type { DashboardSummary, TimeseriesPoint, TimeRange } from '../../types';
import { SparklineArea } from '../../components/ui/SparklineArea';
import { ExpandedWidgetDialog } from './ExpandedWidgetDialog';
import { useDashboardWorklog } from '../../hooks/useDashboardWorklog';
import { WorklogBentoCard } from './WorklogBentoCard';
import { fillGaps } from './timeseriesFill';
import { formatTokens, formatCost } from './format';

type WidgetType = 'tokens' | 'cost' | 'worklog';

interface BentoSummaryProps {
  summary: DashboardSummary | null;
  tokenTimeseries: TimeseriesPoint[];
  range: TimeRange;
}

const GLOW_CLASS: Record<WidgetType, string> = {
  tokens: 'glow-cyan',
  cost: 'glow-purple',
  worklog: 'glow-green',
};

const LAYOUT_TRANSITION = { layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const } };

export function BentoSummary({ summary, tokenTimeseries, range }: BentoSummaryProps) {
  const [selectedWidget, setSelectedWidget] = useState<WidgetType | null>(null);

  const { data: worklog } = useDashboardWorklog(range);
  const filled = useMemo(() => fillGaps(tokenTimeseries, range), [tokenTimeseries, range]);
  const inputData = useMemo(() => filled.map(p => p.input), [filled]);
  const outputData = useMemo(() => filled.map(p => p.output), [filled]);
  const costData = useMemo(() => filled.map(p => p.cost), [filled]);

  // Escape key to close
  useEffect(() => {
    if (!selectedWidget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedWidget(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedWidget]);

  const cardBase = 'glass-card p-4 flex flex-col justify-between relative overflow-hidden';
  const cardBaseTop = 'glass-card p-4 flex flex-col gap-1 relative overflow-hidden';

  return (
    <LayoutGroup>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Total Tokens */}
        {selectedWidget === 'tokens' ? (
          <div className={`${cardBase} glow-cyan invisible`} />
        ) : (
          <motion.div
            layoutId="widget-tokens"
            onClick={() => setSelectedWidget('tokens')}
            className={`${cardBase} glow-cyan cursor-pointer`}
            style={{ borderRadius: 16 }}
            transition={LAYOUT_TRANSITION}
          >
            <div className="absolute bottom-0 left-0 right-0 h-[60%] z-0 pointer-events-none">
              <SparklineArea data={inputData} color="#22d3ee" fillOpacity={0.12} />
              <div className="absolute inset-0">
                <SparklineArea data={outputData} color="#06b6d4" fillOpacity={0.08} />
              </div>
            </div>
            <span className="text-[11px] font-medium text-[var(--text-secondary)] relative z-10">
              Tokens
            </span>
            <div className="relative z-10">
              {summary && summary.total_tokens > 0 ? (
                <>
                  <div className="flex gap-3 items-baseline">
                    <span className="text-2xl font-bold tracking-tight gradient-text-cyan counter-animate">
                      {formatTokens(summary.total_input_tokens)}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">In</span>
                    <span className="text-2xl font-bold tracking-tight gradient-text-cyan counter-animate">
                      {formatTokens(summary.total_output_tokens)}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">Out</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-[var(--text-secondary)]">
                    <span>Total: {formatTokens(summary.total_tokens)}</span>
                    {summary.total_cached_input_tokens > 0 && (
                      <span>Cache: {formatTokens(summary.total_cached_input_tokens)}</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-2xl font-bold tracking-tight gradient-text-cyan counter-animate">
                  {summary ? '0' : '--'}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Total Cost */}
        {selectedWidget === 'cost' ? (
          <div className={`${cardBaseTop} glow-purple invisible`} />
        ) : (
          <motion.div
            layoutId="widget-cost"
            onClick={() => setSelectedWidget('cost')}
            className={`${cardBaseTop} glow-purple cursor-pointer`}
            style={{ borderRadius: 16 }}
            transition={LAYOUT_TRANSITION}
          >
            <div className="absolute bottom-0 left-0 right-0 h-[60%] z-0 pointer-events-none">
              <SparklineArea data={costData} color="#a78bfa" fillOpacity={0.12} />
            </div>
            <span className="text-[11px] font-medium text-[var(--text-secondary)] relative z-10">
              Total Cost
            </span>
            <div className="text-2xl font-bold tracking-tight gradient-text-purple counter-animate relative z-10">
              {summary ? formatCost(summary.total_cost_usd) : '--'}
            </div>
          </motion.div>
        )}

        {/* Worklog */}
        {selectedWidget === 'worklog' ? (
          <div className={`${cardBase} glow-green invisible`} />
        ) : (
          <WorklogBentoCard
            data={worklog}
            layoutId="widget-worklog"
            onClick={() => setSelectedWidget('worklog')}
          />
        )}
      </div>

      {/* Expanded overlay */}
      {createPortal(
        <AnimatePresence>
          {selectedWidget && (
            <>
              <motion.div
                key="widget-backdrop"
                className="fixed inset-0 z-40"
                style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(16px)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => setSelectedWidget(null)}
              />
              <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-8">
                <motion.div
                  layoutId={`widget-${selectedWidget}`}
                  className={`glass-card expanded-widget pointer-events-auto ${GLOW_CLASS[selectedWidget]}`}
                  style={{
                    borderRadius: 20,
                    width: '100%',
                    maxWidth: 640,
                    height: 400,
                    padding: 24,
                  }}
                  transition={LAYOUT_TRANSITION}
                >
                  <ExpandedWidgetDialog
                    widgetType={selectedWidget}
                    dashboardRange={range}
                    onClose={() => setSelectedWidget(null)}
                  />
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </LayoutGroup>
  );
}
