import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect } from 'react';
import { Bot, Clock, X } from 'lucide-react';

import { useDayWorklog } from '../../hooks/useDayWorklog';
import { formatDuration } from '../../lib/duration';

interface DayWorklogDialogProps {
  day: string | null;
  onClose: () => void;
}

const LAYOUT_TRANSITION = { layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const } };

function projectName(path: string | null): string {
  if (!path) return '(no project)';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function formatDayHeading(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export function DayWorklogDialog({ day, onClose }: DayWorklogDialogProps) {
  const { data: rows } = useDayWorklog(day);

  useEffect(() => {
    if (!day) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [day, onClose]);

  const totalClaude = rows.reduce((s, r) => s + r.claude_work_seconds, 0);
  const totalSessions = rows.reduce((s, r) => s + r.session_count, 0);

  return createPortal(
    <AnimatePresence>
      {day && (
        <>
          <motion.div
            key="heatmap-backdrop"
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(16px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-8">
            <motion.div
              layoutId={`heatmap-cell-${day}`}
              className="glass-card expanded-widget pointer-events-auto glow-cyan"
              style={{
                borderRadius: 20,
                width: '100%',
                maxWidth: 640,
                padding: 24,
              }}
              transition={LAYOUT_TRANSITION}
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.2, duration: 0.25 }}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                      <Clock size={16} aria-hidden strokeWidth={2} />
                      {formatDayHeading(day)}
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {rows.length} project{rows.length === 1 ? '' : 's'} · {totalSessions} session
                      {totalSessions === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="rounded-md px-3 py-1.5 bg-[var(--bg-card)] inline-flex items-center gap-1 text-xs text-accent-purple">
                      <Bot size={12} aria-hidden strokeWidth={2} />
                      <span className="font-medium">{formatDuration(totalClaude)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onClose(); }}
                      className="rounded-md p-1 text-text-secondary hover:bg-[var(--bg-card)] hover:text-text-primary transition"
                      aria-label="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-text-secondary">
                    No worklog data for this day
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {rows.map((r) => {
                      const name = projectName(r.project_path);
                      const fullPath = r.project_path ?? '(no project)';
                      return (
                        <div
                          key={fullPath}
                          className="flex items-center justify-between rounded-lg px-3 py-2.5 bg-[var(--bg-card)]"
                          title={fullPath}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-text-primary">{name}</div>
                            <div className="text-[11px] text-text-secondary">
                              {r.session_count} session{r.session_count === 1 ? '' : 's'}
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs text-accent-purple">
                            <Bot size={12} aria-hidden strokeWidth={2} />
                            <span className="font-medium">{formatDuration(r.claude_work_seconds)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
