/**
 * Recreations of the app's other three screens, built from the same tokens as
 * the real UI rather than screenshotted, so they stay sharp and themed.
 */

const TURNS = [
  {
    kind: "user",
    label: "You",
    time: "14:02:11",
    body: "The daily_usage rows double when a session JSONL is re-imported. Find out why.",
  },
  {
    kind: "thinking",
    label: "Thinking",
    time: "14:02:13",
    body: "The importer upserts sessions by id but appends usage rows keyed only by date…",
  },
  {
    kind: "tool",
    label: "Grep",
    time: "14:02:15",
    body: "src-tauri/src/jsonl/import.rs — 4 matches for `daily_usage`",
  },
  {
    kind: "assistant",
    label: "Claude",
    time: "14:02:31",
    body: "The insert has no unique constraint on (date, session_id), so a second import adds a row instead of replacing it.",
  },
] as const;

const BUBBLE: Record<string, string> = {
  user: "bg-[var(--bubble-user)] border-[var(--bubble-user-border)]",
  assistant: "bg-[var(--bubble-assistant)] border-[var(--bubble-assistant-border)]",
  thinking: "bg-[var(--bubble-thinking)] border-[var(--bubble-thinking-border)]",
  tool: "bg-[var(--bubble-tool)] border-[var(--bubble-tool-border)]",
};

const LABEL_COLOR: Record<string, string> = {
  user: "text-cyan",
  assistant: "text-fg",
  thinking: "text-amber",
  tool: "text-teal",
};

export function TranscriptPreview() {
  return (
    <div className="glass-card font-system overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-fg">
            Fix daily_usage double-counting
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">
            ~/Projects/claude-lens · 24 turns · 41m 18s
          </p>
        </div>
        <span
          className="shrink-0 text-cyan"
          title="Bookmarked"
          aria-label="Bookmarked"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        </span>
      </header>

      <ol className="scroll-thin max-h-[340px] space-y-2.5 overflow-y-auto p-4">
        {TURNS.map((turn) => (
          <li
            key={turn.time}
            className={`rounded-[12px] border px-3 py-2.5 ${BUBBLE[turn.kind]}`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`font-mono text-[10px] font-medium ${LABEL_COLOR[turn.kind]}`}
              >
                {turn.label}
              </span>
              <span className="font-mono text-[10px] text-muted tabular-nums">
                {turn.time}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-fg/85">{turn.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const PLANS = [
  { title: "Worklog: Claude-only time, precise measurement", age: "2h ago", size: "6.4 KB", active: true },
  { title: "Bento widget consistency", age: "1d ago", size: "3.1 KB", active: false },
  { title: "Timesheet worklog", age: "1d ago", size: "8.8 KB", active: false },
];

export function PlanPreview() {
  return (
    <div className="glass-card font-system p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-fg">Plans</span>
        <span className="font-mono text-[10px] text-muted">3 plans</span>
      </div>

      <ul className="space-y-1.5">
        {PLANS.map((plan) => (
          <li
            key={plan.title}
            className={`rounded-[12px] border px-3 py-2.5 ${
              plan.active
                ? "border-amber/40 bg-amber/8"
                : "border-line bg-card"
            }`}
          >
            <p className="truncate text-[12px] font-medium text-fg">{plan.title}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted">
              {plan.age} · {plan.size}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-[12px] border border-line bg-card p-3">
        <p className="text-[12px] font-semibold text-fg">Turn definition</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          A turn is one real user message plus every assistant and tool result
          that follows it, up to the next real user message.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-[8px] bg-[var(--bg-secondary)]/60 p-2 font-mono text-[10px] text-teal">
{`claude_seconds =
  last_assistant.end - user.timestamp`}
        </pre>
      </div>
    </div>
  );
}

const DAYS = [
  { day: "Mon", duration: "3h 12m", share: 82, sessions: 6 },
  { day: "Tue", duration: "2h 04m", share: 53, sessions: 4 },
  { day: "Wed", duration: "3h 51m", share: 100, sessions: 9 },
  { day: "Thu", duration: "1h 28m", share: 38, sessions: 3 },
  { day: "Fri", duration: "2h 05m", share: 54, sessions: 5 },
];

export function WorklogPreview() {
  return (
    <div className="glass-card font-system p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-fg">Working time</span>
        <span className="font-mono text-[13px] font-medium text-mint tabular-nums">
          12h 40m
        </span>
      </div>

      <ul className="space-y-2">
        {DAYS.map((entry) => (
          <li key={entry.day} className="flex items-center gap-3">
            <span className="w-8 shrink-0 font-mono text-[10px] text-muted">
              {entry.day}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--heatmap-empty)]">
              <span
                className="block h-full rounded-full bg-mint/60"
                style={{ width: `${entry.share}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-[10px] text-fg tabular-nums">
              {entry.duration}
            </span>
            <span className="hidden w-16 shrink-0 text-right font-mono text-[10px] text-muted tabular-nums sm:block">
              {entry.sessions} sess.
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-line pt-3 font-mono text-[10px] leading-relaxed text-muted">
        Tool execution counts. Time between turns does not.
      </p>
    </div>
  );
}
