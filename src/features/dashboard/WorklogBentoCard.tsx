import { Clock } from 'lucide-react';
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
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-secondary relative z-10">
        <Clock size={13} aria-hidden strokeWidth={2} />
        Worklog
      </span>
      <div className="relative z-10">
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-text-secondary">User</div>
            <div className="text-2xl font-bold tracking-tight text-accent-cyan whitespace-nowrap counter-animate">
              {formatDuration(userSecs)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-text-secondary">Claude</div>
            <div className="text-2xl font-bold tracking-tight text-accent-purple whitespace-nowrap counter-animate">
              {formatDuration(claudeSecs)}
            </div>
          </div>
        </div>
        <div className="mt-1 text-[10px] text-text-secondary">
          <span>Total: {formatDuration(total)} · {sessions} session{sessions !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </motion.div>
  );
}
