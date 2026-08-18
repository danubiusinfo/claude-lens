import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Pencil,
  FilePlus2,
  Terminal,
  Search,
  Globe,
  Bot,
  Folder,
  Coins,
  DollarSign,
  Activity,
  Sparkles,
  Clock,
  Settings as SettingsIcon,
  ClipboardList,
  CheckSquare,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { formatDuration } from '../../lib/duration';
import { getSessionMessages, toggleSessionBookmark, renameSession } from '../../lib/tauri';
import { useTauriEvent } from '../../hooks/useTauriEvent';
import { useSessionWorklog } from '../../hooks/useSessionWorklog';
import { useSessionWorklogTurns } from '../../hooks/useSessionWorklogTurns';
import type { SessionRecord, SessionMessage, ContentBlock } from '../../types';

interface SessionDetailPanelProps {
  session: SessionRecord | null;
  open: boolean;
  onClose: () => void;
  onBookmarkToggle?: (sessionId: string, newValue: boolean) => void;
  onRename?: (sessionId: string, name: string | null) => void;
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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shouldShowMessage(message: SessionMessage): boolean {
  if (message.role !== 'user') return true;
  const text = message.content_text?.trim();
  if (!text) return false;
  if (text.startsWith('<command-name>')) return false;
  if (text.startsWith('<local-command-')) return false;
  if (text.startsWith('/') && !text.includes(' ') && text.length < 30) return false;
  return true;
}

function ThinkingBlockView({ block }: { block: ContentBlock & { block_type: 'thinking' } }) {
  const [open, setOpen] = useState(false);
  const isLong = block.thinking.length > 200;

  return (
    <div className="rounded-md border px-3 py-2" style={{ background: 'var(--bubble-thinking)', borderColor: 'var(--bubble-thinking-border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-medium w-full text-left"
        style={{ color: 'var(--accent-amber)' }}
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Thinking
        {!open && isLong && <span className="text-[var(--text-secondary)] font-normal ml-1">({Math.ceil(block.thinking.length / 1000)}K chars)</span>}
      </button>
      {open && (
        <p className="mt-1.5 text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words italic max-h-96 overflow-y-auto">
          {block.thinking}
        </p>
      )}
    </div>
  );
}

const TOOL_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  Read:       { icon: FileText,       color: 'var(--accent-cyan)' },
  Write:      { icon: FilePlus2,      color: 'var(--accent-purple)' },
  Edit:       { icon: Pencil,         color: 'var(--accent-amber)' },
  Bash:       { icon: Terminal,       color: 'var(--accent-teal)' },
  WebSearch:  { icon: Search,         color: 'var(--accent-cyan)' },
  WebFetch:   { icon: Globe,          color: 'var(--accent-cyan)' },
  Agent:      { icon: Bot,            color: 'var(--accent-purple)' },
  Skill:      { icon: SettingsIcon,   color: 'var(--accent-amber)' },
  TaskCreate: { icon: ClipboardList,  color: 'var(--accent-teal)' },
  TaskUpdate: { icon: ClipboardList,  color: 'var(--accent-teal)' },
  TodoWrite:  { icon: CheckSquare,    color: 'var(--accent-teal)' },
};

function getToolMeta(name: string) {
  return TOOL_ICONS[name] ?? { icon: Wrench, color: 'var(--accent-teal)' };
}

function getToolSummary(name: string, input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const inp = input as Record<string, unknown>;

  switch (name) {
    case 'Read':
      return typeof inp.file_path === 'string' ? inp.file_path : null;
    case 'Write':
      return typeof inp.file_path === 'string' ? inp.file_path : null;
    case 'Edit':
      return typeof inp.file_path === 'string' ? inp.file_path : null;
    case 'Bash':
      return typeof inp.command === 'string' ? inp.command : null;
    case 'WebSearch':
      return typeof inp.query === 'string' ? inp.query : null;
    case 'WebFetch':
      return typeof inp.url === 'string' ? inp.url : null;
    case 'Agent':
      return typeof inp.description === 'string' ? inp.description : null;
    case 'Skill':
      return typeof inp.skill === 'string' ? inp.skill : null;
    default:
      return null;
  }
}

function ToolParamValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const str = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const isLong = str.length > 300 || str.split('\n').length > 5;

  return (
    <div className="relative">
      <pre
        className={`text-[11px] text-[var(--text-primary)] whitespace-pre-wrap break-words font-mono leading-relaxed ${
          !expanded && isLong ? 'max-h-28 overflow-hidden message-fade' : ''
        }`}
      >
        {str}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-medium text-accent-cyan hover:text-accent-cyan/80 transition-colors mt-0.5"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function ToolUseBlockView({ block }: { block: ContentBlock & { block_type: 'tool_use' } }) {
  const [open, setOpen] = useState(false);
  const meta = getToolMeta(block.tool_name);
  const summary = getToolSummary(block.tool_name, block.input);
  const params = typeof block.input === 'object' && block.input !== null
    ? Object.entries(block.input as Record<string, unknown>)
    : [];

  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: 'var(--bubble-tool)', borderColor: 'var(--bubble-tool-border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 w-full text-left hover:brightness-110 transition-all"
      >
        <svg
          className={`w-3 h-3 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          style={{ color: meta.color }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <meta.icon size={14} className="shrink-0" style={{ color: meta.color }} strokeWidth={2} />
        <span className="text-[11px] font-semibold shrink-0" style={{ color: meta.color }}>
          {block.tool_name}
        </span>
        {summary && (
          <span className="text-[11px] text-[var(--text-secondary)] truncate font-mono">
            {summary}
          </span>
        )}
      </button>

      {open && params.length > 0 && (
        <div className="border-t px-3 py-2 space-y-2" style={{ borderColor: 'var(--bubble-tool-border)' }}>
          {params.map(([key, value]) => (
            <div key={key}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: meta.color }}>
                {key}
              </div>
              <div className="rounded-md bg-[var(--bg-primary)]/50 px-2.5 py-1.5">
                <ToolParamValue value={value} />
              </div>
            </div>
          ))}
        </div>
      )}

      {open && params.length === 0 && (
        <div className="border-t px-3 py-2" style={{ borderColor: 'var(--bubble-tool-border)' }}>
          <span className="text-[10px] text-[var(--text-secondary)] italic">No parameters</span>
        </div>
      )}
    </div>
  );
}

function MetadataBadges({ message, sessionProjectPath }: { message: SessionMessage; sessionProjectPath?: string | null }) {
  const meta = message.metadata;
  if (!meta) return null;

  return (
    <>
      {meta.git_branch && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-secondary)]" title="Git branch">
          {meta.git_branch}
        </span>
      )}
      {meta.version && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-secondary)]" title="Claude Code version">
          v{meta.version}
        </span>
      )}
      {meta.is_sidechain && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400" title="Sidechain">
          sidechain
        </span>
      )}
      {meta.cwd && meta.cwd !== sessionProjectPath && (
        <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-secondary)] truncate max-w-[120px]" title={`cwd: ${meta.cwd}`}>
          {meta.cwd}
        </span>
      )}
    </>
  );
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.block_type) {
    case 'thinking':
      return <ThinkingBlockView block={block} />;
    case 'tool_use':
      return <ToolUseBlockView block={block} />;
    case 'text':
      return null; // Text blocks are rendered separately in MessageBubble
  }
}

function StatsRow({ message }: { message: SessionMessage }) {
  const totalTokens = message.input_tokens + message.output_tokens + message.cache_creation_tokens + message.cache_read_tokens;
  if (totalTokens <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
      <span className="text-[10px] text-[var(--text-secondary)]">
        In: {formatTokens(message.input_tokens)}
      </span>
      <span className="text-[10px] text-[var(--text-secondary)]">
        Out: {formatTokens(message.output_tokens)}
      </span>
      {message.cache_read_tokens > 0 && (
        <span className="text-[10px] text-[var(--text-secondary)]">
          Cache: {formatTokens(message.cache_read_tokens)}
        </span>
      )}
      {message.tool_use_count > 0 && (
        <span className="text-[10px] text-[var(--text-secondary)]">
          Tools: {message.tool_use_count}
        </span>
      )}
      <span className="text-[10px] font-semibold text-accent-purple ml-auto">
        {message.cost_usd < 0.001 && message.cost_usd > 0
          ? `$${message.cost_usd.toFixed(4)}`
          : formatCost(message.cost_usd)}
      </span>
    </div>
  );
}

function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      }}
      aria-label="Copy message"
      className="p-0.5 rounded text-[var(--text-secondary)] hover:text-accent-cyan transition-colors opacity-0 group-hover/bubble:opacity-100"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function MessageBubble({ message, sessionProjectPath }: { message: SessionMessage; sessionProjectPath?: string | null }) {
  const isUser = message.role === 'user';
  const [textExpanded, setTextExpanded] = useState(false);

  // Collect text from content_blocks for display
  const textBlocks = message.content_blocks?.filter((b): b is ContentBlock & { block_type: 'text' } => b.block_type === 'text') ?? [];
  const nonTextBlocks = message.content_blocks?.filter(b => b.block_type !== 'text') ?? [];
  const displayText = textBlocks.length > 0
    ? textBlocks.map(b => b.text).join('\n')
    : message.content_text;

  const isLong = (displayText?.split('\n').length ?? 0) > 6 || (displayText?.length ?? 0) > 500;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group/bubble max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-[var(--bubble-user)] border border-[var(--bubble-user-border)]'
            : 'bg-[var(--bubble-assistant)] border border-[var(--bubble-assistant-border)]'
        } ${message.is_meta ? 'opacity-50' : ''}`}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          <span className={`text-xs font-medium ${isUser ? 'text-accent-cyan' : 'text-accent-purple'}`}>
            {isUser ? 'User' : 'Assistant'}
          </span>
          {message.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple">
              {message.model}
            </span>
          )}
          {message.is_meta && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--text-secondary)]/10 text-[var(--text-secondary)]">
              meta
            </span>
          )}
          <MetadataBadges message={message} sessionProjectPath={sessionProjectPath} />
          {displayText && <MessageCopyButton text={displayText} />}
          {message.timestamp && (
            <span className="text-[10px] text-[var(--text-secondary)] ml-auto">
              {new Date(message.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>

        {/* Content blocks */}
        <div className="space-y-1.5">
          {/* Non-text blocks (thinking, tool_use) */}
          {nonTextBlocks.map((block, idx) => (
            <ContentBlockView key={idx} block={block} />
          ))}

          {/* Text content */}
          {displayText && (
            <>
              <div className={`plan-markdown break-words ${!textExpanded && isLong ? 'max-h-36 overflow-hidden message-fade' : ''}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {displayText}
                </ReactMarkdown>
              </div>
              {isLong && (
                <button
                  onClick={() => setTextExpanded(!textExpanded)}
                  className="text-[10px] font-medium text-accent-cyan hover:text-accent-cyan/80 transition-colors"
                >
                  {textExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Token/cost info for assistant messages */}
        {!isUser && <StatsRow message={message} />}
      </div>
    </div>
  );
}

export function SessionDetailPanel({ session, open, onClose, onBookmarkToggle, onRename }: SessionDetailPanelProps) {
  const [turnsOpen, setTurnsOpen] = useState(false);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [dbRevision, setDbRevision] = useState(0);
  const hasMessages = useRef(false);

  const handleDbUpdate = useCallback(() => setDbRevision((r) => r + 1), []);
  useTauriEvent('db-updated', handleDbUpdate);

  const { data: worklog } = useSessionWorklog(session?.id ?? null);
  const { data: turns } = useSessionWorklogTurns(session?.id ?? null);
  const displayMessages = useMemo(() => messages.filter(shouldShowMessage), [messages]);

  // Reset expanded state when panel closes
  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingName) return;
        if (expanded) {
          setExpanded(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, expanded, editingName]);

  useEffect(() => {
    if (!open || !session?.source_session_id) {
      setMessages([]);
      hasMessages.current = false;
      return;
    }
    let cancelled = false;
    if (!hasMessages.current) setMessagesLoading(true);
    getSessionMessages(session.source_session_id)
      .then((msgs) => {
        if (!cancelled) {
          setMessages(msgs);
          hasMessages.current = msgs.length > 0;
        }
      })
      .catch((err) => {
        console.error('Failed to load session messages:', err);
        if (!cancelled) {
          setMessages([]);
          hasMessages.current = false;
        }
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, session?.source_session_id, dbRevision]);

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
        aria-label="Session detail"
        style={{
          backdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
          background: 'var(--panel-surface)',
          border: '1px solid var(--glass-border)',
          borderRight: 'none',
          borderRadius: expanded ? '0' : '20px 0 0 20px',
        }}
        className={`fixed top-0 right-0 bottom-0 z-50 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        } ${expanded ? 'w-full' : 'w-full sm:w-[400px]'}`}
      >
        <div className="h-full flex flex-col">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 px-6 pt-6 pb-3 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]" style={{ borderRadius: expanded ? '0' : '20px 0 0 0' }}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Session Detail
            </h2>
            <div className="flex items-center gap-1">
              {session && (
                <button
                  onClick={async () => {
                    const newVal = await toggleSessionBookmark(session.id);
                    onBookmarkToggle?.(session.id, newVal);
                  }}
                  aria-label={session.bookmarked ? 'Remove bookmark' : 'Add bookmark'}
                  className="p-1.5 rounded-lg hover:bg-bg-surface/50 transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill={session.bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                      className={session.bookmarked ? 'text-accent-cyan' : 'text-[var(--text-secondary)]'} />
                  </svg>
                </button>
              )}
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
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-bg-surface/50 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          {session && (
            <>
              {/* Hero: name + inline meta strip */}
              <div className="space-y-2.5 pt-1">
                {editingName ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const trimmed = nameInput.trim();
                      const newName = trimmed || null;
                      await renameSession(session.id, newName);
                      onRename?.(session.id, newName);
                      setEditingName(false);
                    }}
                    className="space-y-2"
                  >
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Untitled session"
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      className="w-full px-4 py-2 rounded-full bg-[var(--input-bg)] border border-[var(--input-border)] text-base font-semibold text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--input-border-focus)] transition-colors"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditingName(false);
                        }
                      }}
                    />
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)] pl-2">
                      <span className="inline-flex items-center gap-1">
                        <kbd className="font-mono px-1.5 py-px rounded border border-[var(--border-subtle)] bg-[var(--bg-card)]/60 text-[var(--text-primary)]">
                          ↵
                        </kbd>
                        save
                      </span>
                      <span className="opacity-40">·</span>
                      <span className="inline-flex items-center gap-1">
                        <kbd className="font-mono px-1.5 py-px rounded border border-[var(--border-subtle)] bg-[var(--bg-card)]/60 text-[var(--text-primary)]">
                          esc
                        </kbd>
                        cancel
                      </span>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => {
                      setNameInput(session.custom_name ?? '');
                      setEditingName(true);
                    }}
                    className="group/title relative flex items-center gap-2 text-left w-full -ml-1.5 pl-1.5 pr-2 py-0.5 rounded-md hover:bg-[var(--bg-card)]/50 transition-colors"
                    aria-label="Rename session"
                  >
                    <h3
                      className={`text-xl font-semibold leading-tight truncate ${
                        session.custom_name
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] italic font-normal'
                      }`}
                    >
                      {session.custom_name || 'Untitled session'}
                    </h3>
                    <Pencil
                      size={13}
                      strokeWidth={2}
                      className="shrink-0 text-[var(--text-secondary)]/30 group-hover/title:text-accent-cyan transition-colors"
                    />
                  </button>
                )}

              </div>

              {/* Combined stats: one unified row */}
              <section className="glass-card glow-cyan space-y-2.5 px-5 py-4">
                <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs">
                  {session.model_summary && (
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles size={13} strokeWidth={2} className="text-accent-cyan" />
                      <span className="font-medium text-accent-cyan">
                        {session.model_summary}
                      </span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                    <Clock size={13} strokeWidth={2} className="text-[var(--text-secondary)]" />
                    <span className="text-[var(--text-secondary)]">Started</span>
                    <span
                      className="font-medium"
                      title={formatDateTime(session.first_seen_at)}
                    >
                      {formatTimeAgo(session.first_seen_at)}
                    </span>
                  </span>
                  {worklog && worklog.total_claude_seconds > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                      <Bot size={13} strokeWidth={2} className="text-accent-purple" />
                      <span className="font-medium">
                        {formatDuration(worklog.total_claude_seconds)}
                      </span>
                      <span className="text-[var(--text-secondary)]">worktime</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                    <Coins size={13} strokeWidth={2} className="text-accent-cyan" />
                    <span className="font-medium">
                      {session.total_tokens > 0 ? formatTokens(session.total_tokens) : '—'}
                    </span>
                    <span className="text-[var(--text-secondary)]">tokens</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                    <DollarSign size={13} strokeWidth={2} className="text-accent-purple" />
                    <span className="font-medium">
                      {session.total_cost_usd > 0 ? formatCost(session.total_cost_usd) : '—'}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                    <Activity size={13} strokeWidth={2} className="text-[var(--text-secondary)]" />
                    <span className="font-medium">{session.event_count}</span>
                    <span className="text-[var(--text-secondary)]">events</span>
                  </span>
                  {session.tool_event_count > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                      <Wrench size={13} strokeWidth={2} className="text-[var(--text-secondary)]" />
                      <span className="font-medium">{session.tool_event_count}</span>
                      <span className="text-[var(--text-secondary)]">tools</span>
                    </span>
                  )}
                </div>

                <div
                  className={`text-xs text-[var(--text-secondary)] min-w-0 ${
                    expanded ? 'flex items-center gap-2' : 'flex flex-col gap-1.5'
                  }`}
                >
                  {session.project_path && (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Folder size={13} strokeWidth={2} className="shrink-0" />
                      <code className="font-mono truncate min-w-0" title={session.project_path}>
                        {session.project_path}
                      </code>
                    </div>
                  )}
                  <div
                    className={`flex items-center gap-1 min-w-0 ${
                      expanded ? 'ml-auto shrink-0' : ''
                    }`}
                  >
                    <code className="font-mono truncate min-w-0">
                      {session.source_session_id ?? session.id}
                    </code>
                    <CopyButton text={session.source_session_id ?? session.id} />
                  </div>
                </div>

                {worklog && worklog.turn_count > 0 && turns.length > 0 && (
                  <>
                    <button
                      onClick={() => setTurnsOpen(!turnsOpen)}
                      className="text-[10px] text-[var(--text-secondary)] hover:text-accent-cyan transition-colors"
                    >
                      {turnsOpen ? 'Hide' : 'View'} {worklog.turn_count} turn
                      {worklog.turn_count === 1 ? '' : 's'}
                    </button>
                    {turnsOpen && (
                      <div className="max-h-48 overflow-y-auto rounded-md bg-[var(--bg-primary)]/40">
                        {turns.map((t) => (
                          <div
                            key={t.index}
                            className="flex items-center justify-between px-3 py-1.5 text-xs"
                          >
                            <span className="text-[var(--text-secondary)]">Turn {t.index}</span>
                            <span className="font-medium text-accent-purple">
                              {formatDuration(t.claude_seconds)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Messages */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--text-secondary)]/60">
                  <span>Conversation</span>
                  <span className="flex-1 h-px bg-[var(--border-subtle)]" />
                  {displayMessages.length > 0 && (
                    <span className="tracking-normal normal-case font-normal">
                      {displayMessages.length}
                    </span>
                  )}
                </div>
                {messagesLoading ? (
                  <div className="text-xs text-[var(--text-secondary)] animate-pulse">
                    Loading messages...
                  </div>
                ) : displayMessages.length === 0 ? (
                  <div className="text-xs text-[var(--text-secondary)]">
                    No messages found
                  </div>
                ) : (
                  displayMessages.map((msg, i) => (
                    <MessageBubble
                      key={i}
                      message={msg}
                      sessionProjectPath={session?.project_path}
                    />
                  ))
                )}
              </section>

            </>
          )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
