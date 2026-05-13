---
title: Context Monitor
date: 2026-05-13
status: approved
---

# Context Monitor

## Problem

Claude-lens tracks per-message token counts (input, output, cache_creation, cache_read) but provides no visibility into:

1. **Context window utilization** — how full is the model's context window per turn, when does it approach the limit, and when does compaction occur.
2. **Cache efficiency** — what percentage of input tokens are served from cache, how much money the cache saves, and how cache hit rates trend over time.

Users have no way to understand how efficiently their Claude sessions use the context window or how much prompt caching saves them.

## Goals

- Show per-session context window fill trajectory (turn-by-turn area chart).
- Detect and mark compaction events (significant drops in input_tokens between turns).
- Display cache hit rate and dollar savings per session and aggregated across sessions.
- Provide a dashboard-level overview of context usage patterns across all sessions.
- Allow configuring model context limits in Settings (alongside existing pricing config).

## Non-Goals

- Real-time streaming of context usage during an active session (this is post-hoc analysis).
- Predicting when compaction will happen.
- Modifying how Claude Code uses the context window.

## Design

### 1. Session Detail — Context Monitor Section

A new collapsible section in `SessionDetailPanel.tsx`, placed between the existing stats card and the worklog section.

**Collapsed (default):**

- A glass-style card matching the existing panel aesthetic.
- Horizontal gauge bar showing the session's peak `input_tokens` (highest single turn) against the model's context limit.
  - Gradient from green (low) through blue (medium) to yellow (high).
  - Label: `"{peak_tokens} / {limit} ({pct}%)"` centered in the bar.
- Three summary stats below the gauge: Peak Fill %, Cache Hit Rate %, Compaction Count.
- Toggle button: "Show details" / "Hide details".

**Expanded:**

All of the above, plus:

- **Area chart** (Recharts `AreaChart`) showing context usage per turn:
  - X-axis: turn number (1-based, assistant messages only).
  - Y-axis: token count (0 to model limit).
  - Blue filled area: `input_tokens` per turn (total context sent to API).
  - Green filled area: `cache_read_tokens` per turn (portion served from cache).
  - Red dashed horizontal line: model context limit.
  - Orange dashed vertical lines: compaction events (turns where input_tokens dropped 20%+ from previous turn).
  - Tooltip on hover: turn number, input tokens, cache read tokens, cache hit %, output tokens.
- **Five stat cards** below the chart:
  - Peak Fill % (blue) — highest `input_tokens / limit` across all turns.
  - Avg Fill % (white) — mean `input_tokens / limit` across all turns.
  - Cache Hit Rate % (green) — session-wide `sum(cache_read) / sum(input_tokens)`.
  - Cache Savings $ (green) — `sum(cache_read * (input_price - cache_read_price) / 1M)`.
  - Compaction Count (orange) — number of detected compaction events.

**Data source:** Computed from the existing `SessionMessage[]` returned by `get_session_messages`. Each assistant message already carries `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, and `model`.

### 2. Dashboard — Context & Cache Overview Widget

A new full-width Bento card in `DashboardPage.tsx`, placed after the existing top-row summary cards and before the timeseries charts.

**Left side — three metric cards with sparklines:**

- **Avg Context Fill %** (blue) — average peak context fill across sessions in the time range. Sparkline shows daily trend.
- **Avg Cache Hit Rate %** (green) — average cache hit rate across sessions. Sparkline shows daily trend.
- **Total Cache Savings $** (green) — total dollar savings from cache in the time range. Shows percentage of total input cost saved.

**Right side — Context Fill Distribution bar chart:**

- Horizontal bar chart showing how many sessions fall into each fill bucket:
  - 0–25% (green), 25–50% (light green), 50–75% (blue), 75–90% (yellow), 90%+ (red).
- Each bar labeled with session count.

**Follows existing dashboard time range selector** (Today, WorkWeek, Week, Month, All).

### 3. Model Context Limits Configuration

Extend the existing model pricing system in Settings:

- Add a `context_limit` column to the `model_pricing` database table (integer, tokens).
- Defaults: all current models (opus, sonnet, haiku) → 200,000 tokens.
- In `SettingsPage.tsx`, add a "Context Limit" column to the existing Model Pricing table.
- Unknown models (not in the pricing table) show raw numbers without a percentage or limit line.

### 4. Backend Changes

**New Rust types:**

```rust
struct TurnContextPoint {
    turn: i64,              // 1-based turn number
    input_tokens: i64,      // total input for this turn
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_creation_tokens: i64,
    is_compaction: bool,    // true if input dropped 20%+ from previous turn
}

struct SessionContextStats {
    context_limit: Option<i64>,  // from model_pricing, None if unknown model
    peak_input_tokens: i64,
    peak_fill_pct: Option<f64>,  // None if no limit known
    avg_fill_pct: Option<f64>,
    cache_hit_rate: f64,         // 0.0-1.0
    cache_savings_usd: f64,
    compaction_count: i64,
    turns: Vec<TurnContextPoint>,
}

struct FillBucket {
    label: String,           // "0-25%", "25-50%", etc.
    min_pct: f64,
    max_pct: f64,
    session_count: i64,
}

struct DailyContextPoint {
    day: String,             // YYYY-MM-DD
    value: f64,              // fill % or cache hit rate depending on usage
}

struct DashboardContextSummary {
    avg_peak_fill_pct: Option<f64>,
    avg_cache_hit_rate: f64,
    total_cache_savings_usd: f64,
    cache_savings_pct: f64,      // savings as % of total input cost
    fill_distribution: Vec<FillBucket>,  // 5 buckets
    daily_avg_fill: Vec<DailyContextPoint>,
    daily_avg_cache_rate: Vec<DailyContextPoint>,
}
```

**New Tauri commands:**

- `get_session_context_stats(session_id: String) -> SessionContextStats`
  - Reads session messages, looks up model context limit from pricing table, computes per-turn stats.
  - Compaction detection: `input_tokens[n] < input_tokens[n-1] * 0.8`.
  - Cache savings: `cache_read_tokens * (input_price - cache_read_price) / 1_000_000`.

- `get_dashboard_context_summary(time_range: String) -> DashboardContextSummary`
  - Aggregates context stats across all sessions in the time range.
  - Computes fill distribution buckets and daily averages.

**Database migration (v12):**

- `ALTER TABLE model_pricing ADD COLUMN context_limit INTEGER DEFAULT 200000;`

### 5. Frontend Components

**New files:**

- `src/features/sessions/ContextMonitor.tsx` — the collapsible session-level component.
- `src/features/dashboard/ContextOverviewCard.tsx` — the dashboard widget.
- `src/hooks/useSessionContext.ts` — hook wrapping `get_session_context_stats`.
- `src/hooks/useDashboardContext.ts` — hook wrapping `get_dashboard_context_summary`.

**Modified files:**

- `src/features/sessions/SessionDetailPanel.tsx` — import and place `ContextMonitor`.
- `src/pages/DashboardPage.tsx` — import and place `ContextOverviewCard`.
- `src/pages/SettingsPage.tsx` — add context_limit column to pricing table.
- `src/types/index.ts` — add TypeScript interfaces for the new types.
- `src/lib/tauri.ts` — add wrappers for the two new commands.

### 6. Compaction Detection Logic

A turn is marked as compaction when:

```
input_tokens[turn N] < input_tokens[turn N-1] * 0.8
```

The 0.8 threshold (20% drop) avoids false positives from minor fluctuations (e.g., shorter user messages). Only assistant messages with `input_tokens > 0` are considered.

## Testing

- Verify context chart renders correctly for sessions with 1 turn, many turns, and compaction events.
- Verify gauge bar color gradient and percentage calculation.
- Verify cache savings calculation matches manual computation.
- Verify dashboard aggregation across time ranges.
- Verify Settings context limit editing persists and affects calculations.
- Verify unknown models gracefully show raw numbers without percentages.
