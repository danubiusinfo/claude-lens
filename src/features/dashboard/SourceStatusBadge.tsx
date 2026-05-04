import { StatusDot } from '../../components/ui/StatusDot';
import { useSourceStatus } from '../../hooks/useSourceStatus';

export function SourceStatusBadge() {
  const { status: sourceStatus } = useSourceStatus();

  if (!sourceStatus) return null;

  const dotStatus = sourceStatus.jsonl.is_importing
    ? 'waiting'
    : sourceStatus.has_jsonl_data
      ? 'connected'
      : 'waiting';

  const label = sourceStatus.jsonl.is_importing
    ? 'Importing...'
    : sourceStatus.has_jsonl_data
      ? `${sourceStatus.jsonl.total_sessions} sessions`
      : 'No data';

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)]">
        <StatusDot status={dotStatus} />
        <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
      </div>
    </div>
  );
}
