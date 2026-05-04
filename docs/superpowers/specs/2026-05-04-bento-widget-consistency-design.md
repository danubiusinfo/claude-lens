---
title: Bento Dashboard Widget Consistency
date: 2026-05-04
status: approved
---

# Bento Dashboard Widget Consistency

## Problem

The three top-row dashboard widgets (Tokens, Total Cost, Worklog) have inconsistent design:

1. **Total Cost** is visually a single-row card while Tokens and Worklog are two-row cards. The vertical balance differs.
2. **Worklog** has a `Clock` icon next to its label; the other two widgets have icon-less labels. The label text is also outdated (`Worklog` instead of `Working time`).
3. The expanded bento dialog (when a widget is clicked) has no time range control. Its chart only reflects the dashboard-wide range, so the user cannot zoom/scope inside the dialog without changing the entire dashboard.

## Goals

- Visual consistency across the three top widgets.
- A widget-local time range control inside each expanded dialog that does not affect the dashboard's selector and is not affected by it.

## Non-Goals

- Changing the data model. No new backend fields.
- Reworking other dashboard sections (heatmap, project list, charts).
- Persisting the dialog's range across reopens.

## Design

### 1. Total Cost — top-aligned single-row layout

The Tokens and Worklog cards use `flex-col justify-between` (label top, content pushed to the bottom). The Cost card uses the same class but only has one content element, which makes it look unbalanced.

Change: in `BentoSummary.tsx`, render the Cost card with `flex-col gap-1` (no `justify-between`). Label and value sit at the top of the card; the sparkline remains absolutely positioned at the bottom.

No change to data, sparkline, or hover/glow effects.

### 2. Worklog — icon removal and rename

In `WorklogBentoCard.tsx`:

- Remove the `Clock` icon and its import.
- Replace the label text `Worklog` with `Working time`.
- The label becomes a plain `<span>` matching the other widgets (no `inline-flex` wrapper).

The expanded dialog header in `ExpandedWidgetChart.tsx` currently renders `⏱ Worklog`. Rename to `Working time` (no icon).

### 3. Per-dialog independent time range selector

**Component change — `TimeRangeSelector`:**

Add an optional `size` prop: `'md' | 'sm'` (default `'md'`).

- `md` (current): `px-3 py-1 text-xs`, container padding `p-[3px]`
- `sm`: `px-2 py-0.5 text-[10px]`, container padding `p-[2px]`

All other styling (rounded-full, glass background, aria attributes) stays identical.

**New wrapper component — `ExpandedWidgetDialog`:**

Introduce `src/features/dashboard/ExpandedWidgetDialog.tsx`. Responsibilities:

- Holds a local `dialogRange` state, initialized from a `dashboardRange` prop. The state is created fresh each time the dialog mounts (no persistence). Closing the dialog unmounts it; reopening initializes again from the current dashboard range.
- Fetches data based on `dialogRange`:
  - For `tokens` and `cost` widgets: calls `getTokenTimeseries(dialogRange)` (and `getDashboardSummary(dialogRange)` if needed for headline numbers — but the dialog only renders the chart, so timeseries is sufficient). Local fetching uses a small dedicated hook `useDialogTokenTimeseries(range)` (or inline `useEffect` — implementation detail, see plan).
  - For `worklog` widget: calls the existing `useDashboardWorklog(dialogRange)` hook.
- Renders the dialog header: title + `TimeRangeSelector` (size `sm`) + close button.
- Renders `ExpandedWidgetChart` underneath, passing the fetched data.

`ExpandedWidgetChart` becomes a presentational component: it no longer knows about the close button or the title — those move into the wrapper. It just renders the chart given `widgetType`, `data`, and (for worklog) `worklogData`.

**`BentoSummary` change:**

The expanded overlay currently inlines the close button + chart inside `ExpandedWidgetChart`. Replace the contents with `<ExpandedWidgetDialog widgetType={selectedWidget} dashboardRange={range} onClose={...} />`. The `LayoutGroup` / `layoutId` animation continues to wrap the dialog box.

### Data flow summary

```
DashboardPage (range)
 └── BentoSummary (range)            ← drives the small cards & the initial dialog range
      └── ExpandedWidgetDialog
           ├── dialogRange (own state, init = range)
           ├── TimeRangeSelector size=sm  ← updates dialogRange only
           └── ExpandedWidgetChart (data from dialogRange)
```

The dashboard's `setRange` is never called from inside the dialog. The dialog's `setDialogRange` is never called from outside. They are fully independent for the dialog's lifetime.

### Loading state inside the dialog

When the user changes `dialogRange`, the new fetch may take a moment. Show a faint spinner or keep the previous chart visible (whichever fits the existing chart loading style). Behavior: keep the chart visible during refetch (no full re-mount), so layout doesn't jump. A small spinner on the right side of the header can indicate fetching, matching the existing app's quiet-loading style.

## Files Affected

- `src/features/dashboard/BentoSummary.tsx` — Cost card layout, dialog wiring
- `src/features/dashboard/WorklogBentoCard.tsx` — icon removal, rename
- `src/features/dashboard/ExpandedWidgetChart.tsx` — drop header/close button, become presentational; rename worklog title
- `src/features/dashboard/ExpandedWidgetDialog.tsx` — **NEW** wrapper with local range state and data fetching
- `src/features/dashboard/TimeRangeSelector.tsx` — new `size` prop

## Risks

- The `layoutId` animation in `motion.div` must still wrap the new dialog wrapper so the open/close transition keeps working. We move only the inner content; the outer animated container remains in `BentoSummary`.
- The cost widget's sparkline is absolutely positioned. Removing `justify-between` does not affect the sparkline as long as the relative content uses normal flow above it — verify by inspection.
