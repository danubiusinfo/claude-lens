# Bento Widget Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three top dashboard bento widgets visually consistent and add a per-dialog independent time range selector.

**Architecture:** Cosmetic refactor of three React components plus a new `ExpandedWidgetDialog` wrapper that encapsulates dialog-local time-range state and data fetching. The existing `ExpandedWidgetChart` becomes presentational. `TimeRangeSelector` gains a `size` prop for the smaller in-dialog variant.

**Tech Stack:** React 19, TypeScript, Tailwind, motion (framer-motion successor), recharts, Tauri commands via `lib/tauri`.

**Verification note:** This codebase has no test framework configured. Verification per task is done via `npx tsc --noEmit` (type check) and `npm run build` (Vite production build). Visual verification is done in the running dev server (`npm run dev`) at the end. Each task ends with a commit.

---

## File Structure

| File | Role | Change |
|------|------|--------|
| `src/features/dashboard/TimeRangeSelector.tsx` | Range selector pill group | Add optional `size` prop (`'md' \| 'sm'`) |
| `src/features/dashboard/WorklogBentoCard.tsx` | Worklog summary card | Remove `Clock` icon, rename label to "Working time" |
| `src/features/dashboard/BentoSummary.tsx` | Bento grid + dialog overlay | Cost card top-aligned layout; delegate dialog content to `ExpandedWidgetDialog` |
| `src/features/dashboard/ExpandedWidgetChart.tsx` | Expanded chart renderer | Strip header/close button; rename worklog title; become purely presentational |
| `src/features/dashboard/ExpandedWidgetDialog.tsx` | **NEW** dialog wrapper | Owns dialog `range` state, fetches its own data, renders header (title + selector + close) and chart |

---

## Task 1: Add `size` prop to `TimeRangeSelector`

**Files:**
- Modify: `src/features/dashboard/TimeRangeSelector.tsx`

- [ ] **Step 1: Replace component with size-aware version**

Replace the file contents with:

```tsx
import type { TimeRange } from '../../types';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  size?: 'md' | 'sm';
}

const ranges: { label: string; value: TimeRange }[] = [
  { label: 'Today', value: 'Today' },
  { label: 'Work Week', value: 'WorkWeek' },
  { label: '7d', value: 'Week' },
  { label: '30d', value: 'Month' },
  { label: 'All', value: 'All' },
];

const SIZE_STYLES = {
  md: {
    container: 'p-[3px] gap-0.5',
    button: 'px-3 py-1 text-xs',
  },
  sm: {
    container: 'p-[2px] gap-0.5',
    button: 'px-2 py-0.5 text-[10px]',
  },
} as const;

export function TimeRangeSelector({ value, onChange, size = 'md' }: TimeRangeSelectorProps) {
  const styles = SIZE_STYLES[size];
  return (
    <div
      role="group"
      aria-label="Time range"
      className={`flex rounded-full ${styles.container} border border-[var(--border-subtle)] bg-[var(--bg-card)] backdrop-blur-xl`}
    >
      {ranges.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          aria-pressed={value === r.value}
          className={`${styles.button} font-medium rounded-full transition-all duration-200 ${
            value === r.value
              ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/TimeRangeSelector.tsx
git commit -m "feat(dashboard): add size prop to TimeRangeSelector"
```

---

## Task 2: Worklog widget — remove icon, rename label

**Files:**
- Modify: `src/features/dashboard/WorklogBentoCard.tsx`

- [ ] **Step 1: Replace component contents**

Replace the file with:

```tsx
import { motion } from 'motion/react';
import type { WorklogSummary } from '../../types';
import { formatDuration } from '../../lib/duration';

interface WorklogBentoCardProps {
  data: WorklogSummary | null;
  onClick: () => void;
  layoutId: string;
}

export function WorklogBentoCard({ data, onClick, layoutId }: WorklogBentoCardProps) {
  const claudeSecs = data?.total_claude_seconds ?? 0;
  const sessions = data?.session_count ?? 0;

  return (
    <motion.div
      layoutId={layoutId}
      onClick={onClick}
      className="glass-card p-4 flex flex-col justify-between relative overflow-hidden glow-green cursor-pointer"
      style={{ borderRadius: 16 }}
      transition={{ layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
    >
      <span className="text-[11px] font-medium text-text-secondary relative z-10">
        Working time
      </span>
      <div className="relative z-10">
        <div className="text-2xl font-bold tracking-tight text-accent-purple whitespace-nowrap counter-animate">
          {formatDuration(claudeSecs)}
        </div>
        <div className="mt-1 text-[10px] text-text-secondary">
          <span>{sessions} session{sessions !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </motion.div>
  );
}
```

Notes:
- `Clock` import removed.
- Label wrapper changed from `inline-flex items-center gap-1.5` to a plain `text-[11px]` span so it matches the Tokens / Cost label markup exactly.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/WorklogBentoCard.tsx
git commit -m "feat(dashboard): remove icon from Worklog card and rename to Working time"
```

---

## Task 3: Cost card — top-aligned single-row layout

**Files:**
- Modify: `src/features/dashboard/BentoSummary.tsx`

- [ ] **Step 1: Update Cost card classes**

In `src/features/dashboard/BentoSummary.tsx`, find the Cost card `motion.div` (around line 176). It currently uses `${cardBase} glow-purple cursor-pointer` where `cardBase = 'glass-card p-4 flex flex-col justify-between relative overflow-hidden'`.

Add a top-aligned variant. Above the `cardBase` constant (around line 118), add:

```tsx
const cardBaseTop = 'glass-card p-4 flex flex-col gap-1 relative overflow-hidden';
```

Then change the Cost card's className:

From:
```tsx
className={`${cardBase} glow-purple cursor-pointer`}
```

To:
```tsx
className={`${cardBaseTop} glow-purple cursor-pointer`}
```

Also update the placeholder shown when the Cost dialog is open. Find:
```tsx
{selectedWidget === 'cost' ? (
  <div className={`${cardBase} glow-purple invisible`} />
) : (
```

Change to:
```tsx
{selectedWidget === 'cost' ? (
  <div className={`${cardBaseTop} glow-purple invisible`} />
) : (
```

- [ ] **Step 2: Type-check and visual sanity**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/BentoSummary.tsx
git commit -m "feat(dashboard): top-align Total Cost card content"
```

---

## Task 4: Make `ExpandedWidgetChart` presentational

**Files:**
- Modify: `src/features/dashboard/ExpandedWidgetChart.tsx`

Strip the header (title + close button) — the new `ExpandedWidgetDialog` wrapper will own those. The chart component just renders the chart fitting its container.

- [ ] **Step 1: Replace component contents**

Replace the file with:

```tsx
import { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { TimeseriesPoint, WorklogSummary } from '../../types';
import { useChartColors } from '../../hooks/useChartColors';

export type WidgetType = 'tokens' | 'cost' | 'worklog';

interface ExpandedWidgetChartProps {
  widgetType: WidgetType;
  data: TimeseriesPoint[];
  worklogData?: WorklogSummary | null;
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const WIDGET_CONFIG = {
  tokens: {
    areas: [
      { dataKey: 'input', color: '#22d3ee', label: 'Input' },
      { dataKey: 'output', color: '#06b6d4', label: 'Output' },
    ],
    yFormatter: formatTokens,
    tooltipFormatter: (d: Record<string, number>) =>
      `In: ${formatTokens(d.input)}  ·  Out: ${formatTokens(d.output)}`,
  },
  cost: {
    areas: [
      { dataKey: 'cost', color: '#a78bfa', label: 'Cost' },
    ],
    yFormatter: formatCost,
    tooltipFormatter: (d: Record<string, number>) => formatCost(d.cost),
  },
} as const;

export function ExpandedWidgetChart({ widgetType, data, worklogData }: ExpandedWidgetChartProps) {
  const colors = useChartColors();
  const chartData = useMemo(() => data, [data]);

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    backdropFilter: 'blur(40px) saturate(180%)',
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: '12px',
    fontSize: '12px',
    color: colors.tooltipText,
    boxShadow: colors.tooltipShadow,
  };

  if (widgetType === 'worklog') {
    const worklogSeries = (worklogData?.timeseries ?? []).map((p) => ({
      day: p.day,
      claude: Math.round(p.claude_seconds / 60),
    }));

    const formatMinutes = (v: number) => {
      const h = Math.floor(v / 60);
      const m = v % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
      <motion.div
        className="flex-1 min-h-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.3 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={worklogSeries} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="grad-claude" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(d: string) => formatDate(d)}
              stroke={colors.axis}
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={formatMinutes}
              stroke={colors.axis}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value) => [
                formatMinutes(typeof value === 'number' ? value : 0),
                'Claude',
              ]}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />
            <Area
              type="monotone"
              dataKey="claude"
              stroke="#a855f7"
              strokeWidth={2}
              fill="url(#grad-claude)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#a855f7', fill: 'var(--bg-primary)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>
    );
  }

  const config = WIDGET_CONFIG[widgetType];

  return (
    <motion.div
      className="flex-1 min-h-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.25, duration: 0.3 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {config.areas.map(area => (
              <linearGradient key={area.dataKey} id={`grad-${area.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={area.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={area.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke={colors.axis}
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={config.yFormatter}
            stroke={colors.axis}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label) => formatDate(String(label))}
            formatter={(_value, _name, props) => {
              const d = props.payload;
              return [config.tooltipFormatter(d), ''];
            }}
            cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
          />
          {config.areas.map(area => (
            <Area
              key={area.dataKey}
              type="monotone"
              dataKey={area.dataKey}
              stroke={area.color}
              strokeWidth={2}
              fill={`url(#grad-${area.dataKey})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: area.color, fill: 'var(--bg-primary)' }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
```

Changes vs. previous:
- Header `<div>` (title + close button) removed.
- `onClose` prop removed.
- Outer `<div className="flex flex-col h-full">` wrapper removed — `ExpandedWidgetDialog` will provide it.
- Worklog branch's `⏱ Worklog` label removed (it was inside the deleted header).
- Exported `WidgetType` so the wrapper can reuse it.

- [ ] **Step 2: Type-check (will fail until Task 5 / 6)**

Run: `npx tsc --noEmit`
Expected: errors in `BentoSummary.tsx` because `ExpandedWidgetChart` no longer takes `onClose`. That's expected — Task 5 fixes it. Do NOT commit yet.

- [ ] **Step 3: Hold the commit**

This task's commit is bundled with Task 5 since types break in isolation. Move directly to Task 5.

---

## Task 5: Create `ExpandedWidgetDialog` wrapper

**Files:**
- Create: `src/features/dashboard/ExpandedWidgetDialog.tsx`

The wrapper owns dialog-local `range`, fetches data based on it, renders header (title + S-size selector + close button) and the chart.

- [ ] **Step 1: Inspect `lib/tauri` to confirm fetcher signatures**

Run: `grep -n "getTokenTimeseries\|getDashboardSummary" src/lib/tauri.ts`
Expected: confirms `getTokenTimeseries(range: TimeRange): Promise<TimeseriesPoint[]>`. Note exact signatures and adapt the imports below if the exported names differ.

- [ ] **Step 2: Create the wrapper component**

Create `src/features/dashboard/ExpandedWidgetDialog.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { TimeRange, TimeseriesPoint, WorklogSummary } from '../../types';
import { getTokenTimeseries } from '../../lib/tauri';
import { useDashboardWorklog } from '../../hooks/useDashboardWorklog';
import { TimeRangeSelector } from './TimeRangeSelector';
import { ExpandedWidgetChart, type WidgetType } from './ExpandedWidgetChart';

interface ExpandedWidgetDialogProps {
  widgetType: WidgetType;
  dashboardRange: TimeRange;
  onClose: () => void;
}

const ZERO_POINT: Omit<TimeseriesPoint, 'date'> = {
  total: 0, input: 0, output: 0, cached: 0, reasoning: 0, cost: 0,
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDateRange(range: TimeRange): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'Today':
      return { start: today, end: today };
    case 'WorkWeek': {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((day + 6) % 7));
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      return { start: monday, end: friday > today ? today : friday };
    }
    case 'Week': {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      return { start, end: today };
    }
    case 'Month': {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return { start, end: today };
    }
    case 'All':
    default:
      return { start: today, end: today };
  }
}

function fillBetween(data: TimeseriesPoint[], start: Date, end: Date): TimeseriesPoint[] {
  const lookup = new Map(data.map(p => [p.date, p]));
  const result: TimeseriesPoint[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const key = toDateStr(cur);
    result.push(lookup.get(key) ?? { date: key, ...ZERO_POINT });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function fillGaps(data: TimeseriesPoint[], range: TimeRange): TimeseriesPoint[] {
  if (range === 'All' && data.length > 0) {
    const start = new Date(data[0].date + 'T00:00:00');
    const end = new Date(data[data.length - 1].date + 'T00:00:00');
    return fillBetween(data, start, end);
  }
  if (range === 'Today') return data;
  const { start, end } = getDateRange(range);
  return fillBetween(data, start, end);
}

const TITLE: Record<WidgetType, string> = {
  tokens: 'Tokens',
  cost: 'Total Cost',
  worklog: 'Working time',
};

export function ExpandedWidgetDialog({
  widgetType,
  dashboardRange,
  onClose,
}: ExpandedWidgetDialogProps) {
  const [dialogRange, setDialogRange] = useState<TimeRange>(dashboardRange);

  const [tokenSeries, setTokenSeries] = useState<TimeseriesPoint[]>([]);
  const [tokenLoading, setTokenLoading] = useState(false);

  const needsTokens = widgetType === 'tokens' || widgetType === 'cost';

  useEffect(() => {
    if (!needsTokens) return;
    let cancelled = false;
    setTokenLoading(true);
    getTokenTimeseries(dialogRange)
      .then(series => {
        if (!cancelled) setTokenSeries(series);
      })
      .catch(err => {
        if (!cancelled) console.error('dialog token fetch failed:', err);
      })
      .finally(() => {
        if (!cancelled) setTokenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dialogRange, needsTokens]);

  const filled = useMemo(
    () => (needsTokens ? fillGaps(tokenSeries, dialogRange) : []),
    [tokenSeries, dialogRange, needsTokens],
  );

  const { data: worklog, loading: worklogLoading } = useDashboardWorklog(dialogRange);

  const isLoading = needsTokens ? tokenLoading : worklogLoading;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {TITLE[widgetType]}
        </span>
        <div className="flex items-center gap-2">
          <TimeRangeSelector value={dialogRange} onChange={setDialogRange} size="sm" />
          {isLoading && (
            <div className="w-3 h-3 border-2 border-[var(--text-secondary)]/30 border-t-[var(--text-secondary)] rounded-full animate-spin" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-7 h-7 flex items-center justify-center rounded-full
                       hover:bg-white/10 transition-colors text-[var(--text-secondary)]
                       hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
      </div>

      <ExpandedWidgetChart
        widgetType={widgetType}
        data={filled}
        worklogData={worklog as WorklogSummary | null | undefined}
      />
    </div>
  );
}
```

Notes:
- `useDashboardWorklog` is called unconditionally because it's a hook. When `widgetType` is not `worklog` we simply ignore its data. If this is undesirable (extra fetch), it's still fine because the hook only runs when the dialog is mounted (which is short-lived) and the dashboard already invokes it for the same range. If you want to suppress it, only call when `widgetType === 'worklog'` by extracting it into a tiny conditional sub-component — but stick with the simpler version unless profiling shows a problem.
- The `WorklogSummary` cast accommodates whatever the hook returns; check the actual return type once you open the file and adjust if needed (it should already be `WorklogSummary | null`).

- [ ] **Step 3: Verify hook return shape**

Run: `grep -n "export function useDashboardWorklog\|return " src/hooks/useDashboardWorklog.ts | head -10`

Expected: see what it returns. If it returns `{ data, loading, error }`, the destructuring above is correct. If it returns differently (e.g., `{ summary, loading }`), update the destructuring in `ExpandedWidgetDialog.tsx` accordingly.

- [ ] **Step 4: Verify `getTokenTimeseries` import path**

Run: `grep -n "export .* getTokenTimeseries" src/lib/tauri.ts`

Expected: confirm the export. If the symbol is in a different module, update the import.

---

## Task 6: Wire `ExpandedWidgetDialog` into `BentoSummary`

**Files:**
- Modify: `src/features/dashboard/BentoSummary.tsx`

- [ ] **Step 1: Replace expanded overlay content**

In `src/features/dashboard/BentoSummary.tsx`:

1. Add the import near the top:

```tsx
import { ExpandedWidgetDialog } from './ExpandedWidgetDialog';
```

2. Remove the now-unused `ExpandedWidgetChart` import:

Remove this line:
```tsx
import { ExpandedWidgetChart } from './ExpandedWidgetChart';
```

3. Find the expanded overlay section that currently renders:

```tsx
<motion.div
  layoutId={`widget-${selectedWidget}`}
  className={`glass-card expanded-widget pointer-events-auto ${GLOW_CLASS[selectedWidget]}`}
  style={{
    borderRadius: 20,
    width: '100%',
    maxWidth: 640,
    height: 400,
    padding: 24,
  }}
  transition={LAYOUT_TRANSITION}
>
  <ExpandedWidgetChart
    widgetType={selectedWidget}
    data={filled}
    worklogData={worklog}
    onClose={() => setSelectedWidget(null)}
  />
</motion.div>
```

Replace the inner `<ExpandedWidgetChart ... />` call with:

```tsx
<ExpandedWidgetDialog
  widgetType={selectedWidget}
  dashboardRange={range}
  onClose={() => setSelectedWidget(null)}
/>
```

(Leave the surrounding `motion.div` with `layoutId`, glow class, and sizing untouched — the layout animation continues to wrap the dialog box.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If errors persist about `worklog`/`filled` being unused inside the overlay area, that's fine — they're still used by the small cards. If TS reports them as unused outside the dialog overlay, leave them; they ARE used by the small bento cards.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit Tasks 4 + 5 + 6 together**

```bash
git add src/features/dashboard/ExpandedWidgetChart.tsx src/features/dashboard/ExpandedWidgetDialog.tsx src/features/dashboard/BentoSummary.tsx
git commit -m "feat(dashboard): per-dialog independent time range selector for bento widgets"
```

---

## Task 7: Manual visual verification

**No file changes.** Verify behavior in the dev server.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify the three top widgets**

In the dashboard:
- Tokens, Total Cost, Working time — labels with no icons.
- Total Cost label and value sit at the top of the card; sparkline at the bottom; no large empty gap between label and value.
- Working time card displays "Working time" label.

- [ ] **Step 3: Verify dialog independence**

For each widget:
- Click the card → dialog opens with a small (`sm`) `TimeRangeSelector` next to the close button.
- Initial selection in the dialog matches the dashboard's current range.
- Change the dialog's range → chart in the dialog updates; the dashboard selector behind the backdrop is unchanged.
- Close the dialog (click backdrop, press Escape, or click X). The dashboard's selector still reflects its previous value.
- Reopen the same widget → dialog initializes again from the dashboard's current range (no memory of last dialog selection).

- [ ] **Step 4: Verify type and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed.

- [ ] **Step 5: Final commit (if any small fixups were needed during verification)**

If verification revealed minor tweaks, commit them now:

```bash
git add -p
git commit -m "fix(dashboard): bento widget verification fixes"
```

If nothing else changed, no commit is needed.
