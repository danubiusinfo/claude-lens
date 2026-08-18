import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSessions } from '../hooks/useSessions';
import { SessionsList } from '../features/sessions/SessionsList';
import { SessionDetailPanel } from '../features/sessions/SessionDetailPanel';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { shortenPath } from '../lib/paths';


export function SessionsPage() {
  const {
    sessions,
    loading,
    error,
    selectedSession,
    selectedId,
    selectSession,
    clearSelection,
    showBookmarked,
    setShowBookmarked,
    updateSessionBookmark,
    searchQuery,
    setSearchQuery,
    updateSessionName,
    projects,
    selectedProject,
    setSelectedProject,
  } = useSessions();

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [projectMenuPos, setProjectMenuPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!projectDropdownOpen) return;

    const updatePosition = () => {
      const rect = projectTriggerRef.current?.getBoundingClientRect();
      if (rect) {
        setProjectMenuPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) });
      }
    };
    updatePosition();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        projectTriggerRef.current && !projectTriggerRef.current.contains(target) &&
        projectMenuRef.current && !projectMenuRef.current.contains(target)
      ) {
        setProjectDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [projectDropdownOpen]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">Sessions</h1>
        <div className="flex items-center gap-2">
          {/* Project filter */}
          {projects.length > 0 && (
            <div className="relative">
              <button
                ref={projectTriggerRef}
                type="button"
                onClick={() => setProjectDropdownOpen((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors max-w-[200px] ${
                  selectedProject
                    ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--input-border-focus)]'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span className="truncate">{selectedProject ? shortenPath(selectedProject) : 'All projects'}</span>
                <svg
                  className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${projectDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {projectDropdownOpen && createPortal(
                <div
                  ref={projectMenuRef}
                  style={{
                    position: 'fixed',
                    top: projectMenuPos.top,
                    left: projectMenuPos.left,
                    width: projectMenuPos.width,
                    background: 'var(--panel-surface)',
                  }}
                  className="z-[9999] glass-card !p-0"
                >
                  <div className="max-h-[420px] overflow-y-auto overscroll-contain">
                    <button
                      type="button"
                      onClick={() => { setSelectedProject(null); setProjectDropdownOpen(false); }}
                      className={`flex items-center w-full px-3 py-2 text-xs transition-colors ${
                        !selectedProject
                          ? 'bg-accent-cyan/10 text-accent-cyan'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                      }`}
                    >
                      <span className="font-medium">All projects</span>
                    </button>
                    {projects.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setSelectedProject(p); setProjectDropdownOpen(false); }}
                        className={`flex items-center justify-between w-full px-3 py-2 text-xs transition-colors ${
                          selectedProject === p
                            ? 'bg-accent-cyan/10 text-accent-cyan'
                            : 'text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                        }`}
                        title={p}
                      >
                        <span className="font-medium truncate">{shortenPath(p)}</span>
                      </button>
                    ))}
                  </div>
                </div>,
                document.body
              )}
            </div>
          )}
          <button
            onClick={() => setShowBookmarked(!showBookmarked)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              showBookmarked
                ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--input-border-focus)]'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={showBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Bookmarks
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search sessions by content, name, project..."
          className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[var(--input-bg)] border border-[var(--input-border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <SessionsList
        sessions={sessions}
        loading={loading}
        selectedId={selectedId}
        onSelect={selectSession}
      />

      <SessionDetailPanel
        session={selectedSession}
        open={selectedId !== null}
        onClose={clearSelection}
        onBookmarkToggle={updateSessionBookmark}
        onRename={updateSessionName}
      />
    </div>
  );
}
