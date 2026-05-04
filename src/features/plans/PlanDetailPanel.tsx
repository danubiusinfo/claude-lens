import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { revealPlanInFinder } from '../../lib/tauri';
import type { PlanEntry } from '../../types';

interface PlanDetailPanelProps {
  plan: { entry: PlanEntry; content: string } | null;
  open: boolean;
  onClose: () => void;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function CopyContentButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors
        text-[var(--text-secondary)] hover:text-accent-cyan hover:bg-accent-cyan/10 border border-[var(--border-subtle)]"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy Content
        </>
      )}
    </button>
  );
}

export function PlanDetailPanel({ plan, open, onClose }: PlanDetailPanelProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expanded) {
          setExpanded(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, expanded]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-md z-40 transition-all duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Plan detail"
        style={{
          backdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
          background: 'var(--glass-tint)',
          border: '1px solid var(--glass-border)',
          borderRight: 'none',
          borderRadius: expanded ? '0' : '20px 0 0 20px',
        }}
        className={`fixed top-0 right-0 bottom-0 z-50 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        } ${expanded ? 'w-full' : 'w-full sm:w-[560px]'}`}
      >
        <div className="h-full flex flex-col">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 px-6 pt-6 pb-3 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]" style={{ borderRadius: expanded ? '0' : '20px 0 0 0' }}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate pr-4">
              {plan?.entry.title ?? 'Plan'}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-bg-surface/50 transition-colors"
              >
                {expanded ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-bg-surface/50 transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5 space-y-5">
          {plan && (
            <>
              {/* Meta */}
              <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                <span>{formatDateTime(plan.entry.modified_at)}</span>
                <span>{formatSize(plan.entry.size_bytes)}</span>
              </div>

              {/* File path */}
              <div>
                <div className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
                  File
                </div>
                <code className="text-xs text-accent-cyan bg-[var(--bg-primary)] rounded-md px-2 py-1">
                  ~/.claude/plans/{plan.entry.filename}
                </code>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => revealPlanInFinder(plan.entry.filename)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                    text-[var(--text-secondary)] hover:text-accent-purple hover:bg-accent-purple/10 border border-[var(--border-subtle)]"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  Open in Finder
                </button>
                <CopyContentButton text={plan.content} />
              </div>

              {/* Markdown content */}
              <div className="plan-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {plan.content}
                </ReactMarkdown>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
