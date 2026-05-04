import { usePlans } from '../hooks/usePlans';
import { PlanDetailPanel } from '../features/plans/PlanDetailPanel';
import { ErrorBanner } from '../components/ui/ErrorBanner';

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function PlansPage() {
  const { plans, loading, error, selectedPlan, selectPlan, clearSelection } = usePlans();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">Plans</h1>
        {!loading && (
          <span className="text-sm text-[var(--text-secondary)]">
            {plans.length} plan{plans.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="text-sm text-[var(--text-secondary)] animate-pulse py-8 text-center">
          Loading plans...
        </div>
      ) : plans.length === 0 ? (
        <div className="text-sm text-[var(--text-secondary)] py-8 text-center">
          No plans found in ~/.claude/plans/
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <button
              key={plan.filename}
              onClick={() => selectPlan(plan.filename)}
              className={`w-full text-left glass-card !p-4 transition-all duration-200 hover:bg-[var(--bg-card-hover)] ${
                selectedPlan?.entry.filename === plan.filename
                  ? 'ring-1 ring-accent-cyan/40 bg-[var(--bg-card-hover)]'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {plan.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {formatTimeAgo(plan.modified_at)}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {formatSize(plan.size_bytes)}
                    </span>
                  </div>
                </div>
                <svg
                  className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      <PlanDetailPanel
        plan={selectedPlan}
        open={selectedPlan !== null}
        onClose={clearSelection}
      />
    </div>
  );
}
