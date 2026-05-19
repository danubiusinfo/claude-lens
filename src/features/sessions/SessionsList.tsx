import { GlassCard } from '../../components/ui/GlassCard';
import { useSessionWorklogs } from '../../hooks/useSessionWorklogs';
import { Bot } from 'lucide-react';
import { formatDuration } from '../../lib/duration';
import type { SessionRecord } from '../../types';

interface SessionsListProps {
  sessions: SessionRecord[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortenPath(path: string): string {
  // Show just the last 2 segments
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join('/');
}

function SourceBadge() {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-card)] text-[var(--text-secondary)]">
      JSONL
    </span>
  );
}

export function SessionsList({
  sessions,
  loading,
  selectedId,
  onSelect,
}: SessionsListProps) {
  const visibleIds = sessions.map((s) => s.id);
  const { data: worklogs } = useSessionWorklogs(visibleIds);

  if (loading && sessions.length === 0) {
    return (
      <GlassCard>
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
        </div>
      </GlassCard>
    );
  }

  if (sessions.length === 0) {
    return (
      <GlassCard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-accent-cyan/10 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-accent-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-[var(--text-primary)] mb-2">
            No sessions recorded yet
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-md">
            Sessions will appear here once ClaudeLens imports your JSONL history.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div role="list" className="space-y-2">
      {sessions.map((session) => {
        const isSelected = session.id === selectedId;
        return (
          <div key={session.id} role="listitem">
          <button
            onClick={() => onSelect(session.id)}
            className={`glass-card w-full text-left !rounded-2xl p-4 transition-all duration-200 ${
              isSelected
                ? '!border-[var(--accent-cyan)]/30 !bg-[var(--bg-card-hover)]'
                : 'hover:!bg-[var(--bg-card-hover)]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {session.bookmarked && (
                  <svg className="w-3.5 h-3.5 text-accent-cyan flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                )}
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {formatTime(session.first_seen_at)}
                </span>
                <SourceBadge />
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                {formatTimeAgo(session.last_seen_at)}
              </span>
            </div>
            {(session.custom_name || session.display_text) && (
              <p className="text-xs text-[var(--text-primary)] mb-1.5 truncate opacity-80">
                {session.custom_name && (
                  <span className="font-medium">{session.custom_name} — </span>
                )}
                {session.display_text}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
              {session.total_tokens > 0 && (
                <span>{formatTokens(session.total_tokens)} tokens</span>
              )}
              {session.total_cost_usd > 0 && (
                <span>{formatCost(session.total_cost_usd)}</span>
              )}
              <span>{session.event_count} events</span>
              {session.project_path && (
                <span className="truncate opacity-70" title={session.project_path}>
                  {shortenPath(session.project_path)}
                </span>
              )}
              {session.model_summary && (
                <span className="ml-auto px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan text-[11px] font-medium">
                  {session.model_summary}
                </span>
              )}
            </div>
            {(() => {
              const w = worklogs[session.id];
              if (!w || w.total_claude_seconds === 0) return null;
              return (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-accent-purple">
                  <Bot size={12} aria-hidden strokeWidth={2} />
                  <span className="font-medium">{formatDuration(w.total_claude_seconds)}</span>
                </span>
              );
            })()}
          </button>
          </div>
        );
      })}

    </div>
  );
}
