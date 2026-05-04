# v0.1 Product + Engineering Spec
## Project: ClaudeLens (working title)
## Goal
Build a cross-platform desktop application for Windows, macOS, and Linux that visualizes Claude Code OpenTelemetry metrics and events in a beautiful, real-time local dashboard.

The app is a **local-first desktop companion** for Claude Code CLI.
It must:
- run locally on the user's machine
- start an embedded background collector inside the Tauri app
- receive OTLP metrics/events from Claude Code
- persist normalized data into SQLite
- update the UI in near real time
- require no cloud backend for v0.1

---

# 1. Product scope

## 1.1 Core user value
The user installs the desktop app, enables Claude Code telemetry to point to the local collector, and immediately sees:
- live token usage
- live cost accumulation
- session activity
- usage charts
- a GitHub-contribution-like daily heatmap

The app is primarily a **visual observability dashboard** for Claude Code usage.

## 1.2 Non-goals for v0.1
Do NOT implement:
- cloud sync
- user accounts
- team support
- multi-provider support
- public profiles
- plugin architecture
- advanced alerting
- tray/menu bar mini app
- export/share cards
- deep event analytics UI
- OCR/import flows
- background auto-update system

---

# 2. Supported platforms
- macOS (Apple Silicon + Intel if possible)
- Windows
- Linux

Cross-platform stack:
- Tauri 2
- Rust backend
- React frontend
- TypeScript
- SQLite

---

# 3. High-level architecture

## 3.1 Components
### Desktop shell
- Tauri desktop app
- React frontend
- Rust backend

### Embedded collector
A local OTLP collector process is embedded inside the app runtime.
Responsibilities:
- expose local OTLP ingestion endpoint(s)
- receive Claude Code metrics/events
- validate payloads
- normalize data
- persist to SQLite
- publish realtime updates to frontend

### Local database
SQLite stores:
- sessions
- raw events
- normalized metrics
- daily aggregates

### UI
The React UI reads:
- current live state from Tauri events / commands
- historical aggregates from SQLite via Rust commands

---

# 4. Embedded collector design

## 4.1 Collector strategy
Use the **embedded collector** model:

- Tauri app starts local background collector on app startup
- collector listens on localhost only
- collector accepts OTLP input from Claude Code
- collector writes to SQLite
- collector emits internal app events for realtime UI refresh

## 4.2 Startup flow
On app launch:
1. initialize SQLite database
2. run DB migrations
3. start embedded collector
4. bind collector to localhost ports
5. expose collector status to frontend
6. show setup guide if telemetry is not configured yet

## 4.3 Collector transport
Target OTLP support:
- OTLP/gRPC preferred
- OTLP/HTTP optional if straightforward

If implementing both is too much for v0.1:
- ship with one working mode first
- the UI must clearly show the exact env vars the user should set

## 4.4 Collector requirements
Collector must:
- bind only to `127.0.0.1` or `localhost`
- never expose a public network listener
- tolerate malformed payloads
- log collector errors locally
- never crash the whole app because of a bad telemetry payload
- batch DB writes when reasonable
- support reconnects and repeated telemetry bursts

---

# 5. Claude Code integration assumptions

## 5.1 Expected source
The app is designed for Claude Code telemetry only in v0.1.

## 5.2 Setup UX
The app must provide a setup screen with copy-paste-ready environment variables for Claude Code.

The screen should help the user configure:
- telemetry enabled
- OTLP endpoint
- optional export intervals
- optional prompt logging note

Do not automatically modify the user's shell profile in v0.1.
Only provide commands and validation.

## 5.3 Connection verification
The app should provide a "Verify telemetry" action:
- check whether collector is running
- wait for first telemetry signal
- show success state once the first payload arrives

---

# 6. v0.1 features

## 6.1 Dashboard
Main dashboard sections:

### Header summary cards
Show:
- total tokens today
- total cost today
- active session count
- last event time

### Live activity panel
Show:
- collector status
- telemetry connected/disconnected
- live token increment
- live cost increment
- last session id seen
- last model seen if available

### Token timeline
Time series chart:
- x-axis = time
- y-axis = tokens
- selectable range:
  - today
  - 7d
  - 30d
  - all

### Cost timeline
Time series chart:
- x-axis = time
- y-axis = cost
- same time range controls

### Input vs output chart
Chart or stacked bars for:
- input tokens
- output tokens
- cached tokens if available
- reasoning tokens if available

### Daily heatmap
GitHub contribution-style heatmap:
- 1 cell per day
- intensity based on total tokens
- tooltip shows:
  - date
  - total tokens
  - total cost
  - session count

### Sessions list
List recent sessions:
- start time
- last activity time
- token total
- cost total
- model(s) seen
- event count

Clicking a session opens a simple detail panel.

## 6.2 Session detail
For v0.1 keep it simple:
- session id
- first seen
- last seen
- totals
- event count
- model summary
- tool event count if available

No need for rich replay UI yet.

## 6.3 Setup screen
Include:
- telemetry setup instructions
- local endpoint details
- status indicator
- copy buttons
- "test connection" action
- short privacy note

## 6.4 Settings screen
Minimal settings only:
- database file location
- collector port(s)
- start app on boot toggle placeholder if easy
- clear local data
- theme toggle if easy

---

# 7. Data model

## 7.1 Principles
- store raw telemetry for debugging
- store normalized records for queries
- store daily aggregates for fast dashboard rendering

## 7.2 SQLite tables

### app_state
Purpose:
- local app config
Fields:
- key
- value
- updated_at

### sessions
Fields:
- id TEXT PRIMARY KEY
- source_session_id TEXT UNIQUE
- first_seen_at TEXT NOT NULL
- last_seen_at TEXT NOT NULL
- model_summary TEXT NULL
- total_input_tokens INTEGER DEFAULT 0
- total_output_tokens INTEGER DEFAULT 0
- total_cached_input_tokens INTEGER DEFAULT 0
- total_reasoning_tokens INTEGER DEFAULT 0
- total_tokens INTEGER DEFAULT 0
- total_cost_usd REAL DEFAULT 0
- event_count INTEGER DEFAULT 0
- tool_event_count INTEGER DEFAULT 0
- raw_metadata_json TEXT NULL

### metric_points
Purpose:
Normalized metric datapoints, append-friendly.
Fields:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- timestamp TEXT NOT NULL
- session_id TEXT NULL
- metric_name TEXT NOT NULL
- metric_type TEXT NOT NULL
- value REAL NOT NULL
- unit TEXT NULL
- model TEXT NULL
- attributes_json TEXT NULL

### events_raw
Purpose:
Raw OTLP log/event payloads for debugging and future expansion.
Fields:
- id INTEGER PRIMARY KEY AUTOINCREMENT
- timestamp TEXT NOT NULL
- session_id TEXT NULL
- event_name TEXT NOT NULL
- payload_json TEXT NOT NULL

### daily_usage
Purpose:
Pre-aggregated per-day stats for fast heatmap/dashboard queries.
Fields:
- day TEXT PRIMARY KEY
- total_input_tokens INTEGER DEFAULT 0
- total_output_tokens INTEGER DEFAULT 0
- total_cached_input_tokens INTEGER DEFAULT 0
- total_reasoning_tokens INTEGER DEFAULT 0
- total_tokens INTEGER DEFAULT 0
- total_cost_usd REAL DEFAULT 0
- session_count INTEGER DEFAULT 0
- event_count INTEGER DEFAULT 0
- updated_at TEXT NOT NULL

### models_daily
Purpose:
Per-model daily aggregation.
Fields:
- day TEXT NOT NULL
- model TEXT NOT NULL
- total_tokens INTEGER DEFAULT 0
- total_cost_usd REAL DEFAULT 0
- event_count INTEGER DEFAULT 0
- PRIMARY KEY (day, model)

---

# 8. Normalized domain model

## 8.1 Session
A session is the main user-visible unit in the UI.

## 8.2 MetricPoint
Represents a single normalized metric datapoint.

Example logical shape:
- timestamp
- session_id
- metric_name
- value
- unit
- attributes

## 8.3 Event
Represents a normalized event from Claude Code OTLP logs/events.

Example logical shape:
- timestamp
- session_id
- event_name
- model
- attributes
- raw_payload

---

# 9. Mapping rules

## 9.1 General rules
- preserve raw payload
- normalize to a compact internal model
- unknown fields should not crash ingestion
- unsupported metrics/events should be stored raw even if not yet visualized

## 9.2 Session association
- if telemetry includes a session identifier, use it as `source_session_id`
- maintain a stable internal `sessions.id`
- if an event cannot be mapped to a session, store it with `session_id = NULL`

## 9.3 Incremental aggregation
On every accepted metric/event:
- persist raw record if event/log
- persist normalized metric/event
- update related session totals if session is known
- update daily aggregates
- notify frontend of changed summary state

## 9.4 Deduplication
Implement basic deduplication where feasible.
If true dedupe keys are not reliable from payloads, prefer:
- append-only storage
- idempotent aggregate recalculation paths where possible

Do not over-engineer dedupe in v0.1.

---

# 10. Realtime update model

## 10.1 UI refresh strategy
The frontend should update in near real time without polling every widget independently.

Recommended:
- Rust emits app-level events when new telemetry is ingested
- frontend subscribes once
- frontend invalidates relevant queries / refreshes local state

## 10.2 Update frequency
Target:
- visible UI refresh within 1 to 3 seconds after new telemetry is received

Do not render on every single metric point if it causes jank.
Small batching is fine.

---

# 11. Frontend UX / visual direction

## 11.1 Style
Visual direction:
- dark-first
- premium developer tooling feel
- minimal but sexy
- subtle motion
- strong typography
- charts feel polished, not playful

Keywords:
- graphite / near-black surfaces
- cyan / purple accents
- soft glow
- high information density
- smooth counters
- glassmorphism

## 11.2 Main screens
- Dashboard
- Sessions
- Setup
- Settings

## 11.3 Empty states
Must look good.
Examples:
- "No telemetry received yet"
- "Collector is running, waiting for Claude Code"
- "Connect Claude Code to begin"

## 11.4 Error states
Examples:
- collector failed to bind port
- SQLite migration failed
- malformed telemetry received
- no events seen yet

Errors should be human-readable.

---

# 12. Rust/Tauri responsibilities

## 12.1 Rust owns
- collector process/runtime
- OTLP ingestion
- SQLite access
- migrations
- aggregation
- frontend event emission
- filesystem paths
- local config

## 12.2 Frontend owns
- screen rendering
- charts
- filtering
- local display state
- onboarding UX

Do not put SQL logic in the frontend.

---

# 13. Suggested app structure

## 13.1 Frontend
- `src/`
  - `app/` or `pages/`
  - `components/`
  - `features/dashboard/`
  - `features/sessions/`
  - `features/setup/`
  - `features/settings/`
  - `lib/`
  - `hooks/`
  - `types/`

## 13.2 Tauri / Rust
- `src-tauri/src/main.rs`
- `src-tauri/src/collector/`
- `src-tauri/src/db/`
- `src-tauri/src/events/`
- `src-tauri/src/models/`
- `src-tauri/src/queries/`
- `src-tauri/src/state/`
- `src-tauri/src/telemetry/`

Suggested Rust modules:
- `collector/server.rs`
- `collector/parser.rs`
- `collector/ingest.rs`
- `db/migrations.rs`
- `db/sqlite.rs`
- `queries/dashboard.rs`
- `queries/sessions.rs`
- `events/frontend.rs`

---

# 14. Commands exposed from Rust to frontend

Implement Tauri commands approximately like:

- `get_app_status()`
- `get_collector_status()`
- `get_setup_instructions()`
- `get_dashboard_summary(range)`
- `get_token_timeseries(range)`
- `get_cost_timeseries(range)`
- `get_input_output_breakdown(range)`
- `get_daily_heatmap(range)`
- `list_sessions(limit, offset)`
- `get_session_detail(session_id)`
- `clear_local_data()`
- `restart_collector()`

The exact signatures can vary.

---

# 15. Setup instructions requirements

The app must generate copy-paste-ready setup instructions for Claude Code telemetry.

At minimum include:
- enable telemetry
- point exporter to local collector endpoint
- optional shorter export interval for debugging
- note that prompt content is not logged by default

Do not auto-edit shell config in v0.1.
Do not auto-detect all shells in v0.1 unless trivial.

---

# 16. Privacy and security requirements

## 16.1 Local-first
All data stays local in v0.1.

## 16.2 Network exposure
Collector must listen only on localhost.

## 16.3 Secrets
Do not store external secrets unless absolutely necessary.
No cloud API keys required in v0.1.

## 16.4 Prompt privacy
Do not enable prompt body logging by default.
If future support is added, it must be opt-in and clearly labeled.

## 16.5 Clear data
User must be able to wipe local DB from Settings.

---

# 17. Performance requirements

## 17.1 Startup
Cold app startup target:
- acceptable under a few seconds on a normal dev laptop

## 17.2 Query performance
Dashboard queries should feel instant for normal single-user datasets.

## 17.3 Storage
Data volume is expected to be manageable in SQLite for v0.1.

## 17.4 Rendering
Charts should remain smooth with aggregation.
Avoid plotting millions of raw points directly.

---

# 19. Acceptance criteria for v0.1

The build is accepted when all are true:

1. App runs on macOS
2. Tauri app starts an embedded local collector automatically.
3. Collector listens only on localhost.
4. App persists telemetry-derived data to SQLite.
5. Dashboard shows live total tokens and live total cost.
6. Dashboard shows token chart and cost chart.
7. Dashboard shows daily heatmap.
8. Recent sessions list is functional.
9. Setup screen provides copy-paste-ready Claude Code telemetry instructions.
10. UI updates after new telemetry is ingested without requiring full app restart.
11. App handles no-data and disconnected states gracefully.
12. User can clear local data.

---

# 20. Implementation priority

## Phase 1
- app shell
- SQLite setup
- collector startup
- setup screen
- collector status UI

## Phase 2
- ingest pipeline
- normalized storage
- dashboard summary
- token/cost charts

## Phase 3
- daily heatmap
- sessions list
- session detail

## Phase 4
- polish
- empty/error states
- performance cleanup
- packaging fixes

---

# 21. Definition of done
v0.1 is done when a user can:
- install/run the desktop app
- point Claude Code telemetry at the local collector
- see real usage data arrive
- inspect basic historical usage visually
- trust that data stays local
- enjoy a polished, sexy developer dashboard
