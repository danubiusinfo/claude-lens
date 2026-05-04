import { GlassCard } from '../../components/ui/GlassCard';
import { StatusDot } from '../../components/ui/StatusDot';
import { useSourceStatus } from '../../hooks/useSourceStatus';

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
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

export function SourceHealthPanel() {
  const { status: sourceStatus } = useSourceStatus();

  return (
    <div>
      <GlassCard className="!p-4">
        <div className="flex items-center gap-2 mb-2">
          <StatusDot
            status={
              sourceStatus?.jsonl.is_importing
                ? 'waiting'
                : sourceStatus?.has_jsonl_data
                  ? 'connected'
                  : 'waiting'
            }
          />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            JSONL History
          </span>
        </div>
        {sourceStatus ? (
          <div className="space-y-1 text-xs text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>Files</span>
              <span className="text-[var(--text-primary)]">
                {sourceStatus.source_file_count}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Sessions</span>
              <span className="text-[var(--text-primary)]">
                {sourceStatus.jsonl.total_sessions}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Last import</span>
              <span className="text-[var(--text-primary)]">
                {sourceStatus.jsonl.is_importing
                  ? 'Importing...'
                  : formatTimeAgo(sourceStatus.jsonl.last_import_at)}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-[var(--text-secondary)]">Loading...</div>
        )}
      </GlassCard>
    </div>
  );
}
