import { GlassCard } from '../../components/ui/GlassCard';
import { useProjectStats } from '../../hooks/useProjectStats';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

export function ProjectList() {
  const { projects, loading } = useProjectStats();

  return (
    <GlassCard>
      <h3 className="text-[13px] font-medium text-[var(--text-secondary)] mb-4">
        Projects
      </h3>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-[var(--text-secondary)] text-sm">
          No project data yet
        </div>
      ) : (
        <div className="space-y-1 max-h-[248px] overflow-y-auto pr-1">
          {projects.map((p) => (
            <div
              key={p.project_path}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors"
            >
              <svg
                className="w-4 h-4 text-[var(--text-secondary)] shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text-primary)] truncate">
                  {p.project_name}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] truncate">
                  {p.project_path}
                </div>
              </div>
              <div className="flex gap-3 text-[11px] text-[var(--text-secondary)] shrink-0">
                <span>{p.session_count}s</span>
                <span className="text-[var(--accent-cyan)]">{formatTokens(p.total_tokens)}</span>
                <span className="text-[var(--accent-purple)]">{formatCost(p.total_cost_usd)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
