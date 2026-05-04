import { useMemo } from 'react';
import { motion } from 'motion/react';
import type { WorklogSummary } from '../../types';
import { formatDuration } from '../../lib/duration';
import { SparklineArea } from '../../components/ui/SparklineArea';

interface WorklogBentoCardProps {
  data: WorklogSummary | null;
  onClick: () => void;
  layoutId: string;
}

export function WorklogBentoCard({ data, onClick, layoutId }: WorklogBentoCardProps) {
  const claudeSecs = data?.total_claude_seconds ?? 0;
  const sessions = data?.session_count ?? 0;
  const sparkline = useMemo(
    () => (data?.timeseries ?? []).map((p) => p.claude_seconds),
    [data],
  );

  return (
    <motion.div
      layoutId={layoutId}
      onClick={onClick}
      className="glass-card p-4 flex flex-col justify-between relative overflow-hidden glow-green cursor-pointer"
      style={{ borderRadius: 16 }}
      transition={{ layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
    >
      <div className="absolute bottom-0 left-0 right-0 h-[60%] z-0 pointer-events-none">
        <SparklineArea data={sparkline} color="var(--color-green)" fillOpacity={0.12} />
      </div>
      <span className="text-[11px] font-medium text-text-secondary relative z-10">
        Working time
      </span>
      <div className="relative z-10">
        <div className="text-2xl font-bold tracking-tight text-accent-green whitespace-nowrap counter-animate">
          {formatDuration(claudeSecs)}
        </div>
        <div className="mt-1 text-[10px] text-text-secondary">
          <span>{sessions} session{sessions !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </motion.div>
  );
}
