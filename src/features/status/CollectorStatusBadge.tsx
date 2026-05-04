import { useSourceStatus } from '../../hooks/useSourceStatus';
import { StatusDot } from '../../components/ui/StatusDot';

export function CollectorStatusBadge() {
  const { status: sourceStatus } = useSourceStatus();

  const jsonlDotStatus: 'connected' | 'waiting' | 'error' = sourceStatus?.jsonl.is_importing
    ? 'waiting'
    : sourceStatus?.has_jsonl_data
      ? 'connected'
      : 'waiting';

  const jsonlLabel = sourceStatus?.jsonl.is_importing
    ? 'Importing...'
    : sourceStatus?.has_jsonl_data
      ? `${sourceStatus.jsonl.total_sessions} sessions`
      : 'No data';

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)]">
      <StatusDot status={jsonlDotStatus} />
      <span className="text-[11px] font-medium text-[var(--text-secondary)]">JSONL</span>
      <span className="text-[11px] text-[var(--text-secondary)]">{jsonlLabel}</span>
    </div>
  );
}
