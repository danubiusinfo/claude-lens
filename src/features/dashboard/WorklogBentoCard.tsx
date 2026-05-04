import { motion } from 'motion/react';
import type { WorklogSummary } from '../../types';
import { formatDuration } from '../../lib/duration';

interface WorklogBentoCardProps {
  data: WorklogSummary | null;
  onClick: () => void;
  layoutId: string;
}

export function WorklogBentoCard({ data, onClick, layoutId }: WorklogBentoCardProps) {
  const userSecs = data?.total_user_seconds ?? 0;
  const claudeSecs = data?.total_claude_seconds ?? 0;
  const total = userSecs + claudeSecs;
  const sessions = data?.session_count ?? 0;

  return (
    <motion.div
      layoutId={layoutId}
      onClick={onClick}
      className="glass-card p-4 flex flex-col justify-between relative overflow-hidden glow-green cursor-pointer"
      style={{ borderRadius: 16 }}
      transition={{ layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
    >
      <span className="text-[11px] font-medium text-[var(--text-secondary)] relative z-10">
        ⏱ Worklog
      </span>
      <div className="relative z-10">
        <div className="flex gap-3 items-baseline">
          <span className="text-2xl font-bold tracking-tight text-cyan-400 counter-animate">
            {formatDuration(userSecs)}
          </span>
          <span className="text-[11px] text-[var(--text-secondary)]">User</span>
          <span className="text-2xl font-bold tracking-tight text-purple-400 counter-animate">
            {formatDuration(claudeSecs)}
          </span>
          <span className="text-[11px] text-[var(--text-secondary)]">Claude</span>
        </div>
        <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
          <span>Total: {formatDuration(total)} · {sessions} session{sessions !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </motion.div>
  );
}
