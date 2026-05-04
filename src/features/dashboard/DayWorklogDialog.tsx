import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

import { useDayWorklog } from '../../hooks/useDayWorklog';
import { WorklogPair } from '../../components/ui/WorklogPair';

interface DayWorklogDialogProps {
  day: string | null;
  onClose: () => void;
}

const PROJECT_COLORS = [
  '#06b6d4',
  '#a855f7',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#3b82f6',
  '#10b981',
  '#ef4444',
];

function colorFor(project: string | null): string {
  if (!project) return '#64748b';
  let hash = 0;
  for (let i = 0; i < project.length; i++) hash = (hash * 31 + project.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
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

  if (!day) return null;

  const totalUser = rows.reduce((s, r) => s + r.user_work_seconds, 0);
  const totalClaude = rows.reduce((s, r) => s + r.claude_work_seconds, 0);
  const totalSessions = rows.reduce((s, r) => s + r.session_count, 0);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        key="dialog"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div
          className="pointer-events-auto w-full max-w-2xl rounded-2xl p-6 shadow-2xl"
          style={{
            background: 'var(--glass-tint)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-[var(--text-primary)]">{formatDayHeading(day)}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {rows.length} project{rows.length === 1 ? '' : 's'} · {totalSessions} session
                {totalSessions === 1 ? '' : 's'}
              </div>
            </div>
            <div className="rounded-md px-3 py-1.5" style={{ background: 'var(--bg-card)' }}>
              <WorklogPair userSeconds={totalUser} claudeSeconds={totalClaude} size="sm" />
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-secondary)]">
              No worklog data for this day
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {rows.map((r) => {
                const project = r.project_path ?? '(no project)';
                const accent = colorFor(r.project_path);
                return (
                  <div
                    key={project}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5"
                    style={{
                      background: 'var(--bg-card)',
                      borderLeft: `3px solid ${accent}`,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--text-primary)]">{project}</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {r.session_count} session{r.session_count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <WorklogPair
                      userSeconds={r.user_work_seconds}
                      claudeSeconds={r.claude_work_seconds}
                      size="sm"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
