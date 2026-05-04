# Spec: JSONL-first architecture with optional OTel live ingestion
## Project context
The application already supports:
- OpenTelemetry ingestion
- realtime visualization
- local persistence and dashboard rendering

The next iteration should **shift the primary data source to Claude Code local JSONL files**, while keeping **OTel as an optional secondary live source**.

The product goal is:

> Build a local-first desktop dashboard for Claude Code that uses local JSONL history as the primary source of truth and optionally augments it with live OTel ingestion.

---

# 1. Goals

## 1.1 Primary goal
Refactor the application so that:

- **historical data comes primarily from Claude Code local JSONL files**
- **OTel is optional**
- the app remains **local-first**
- the user gets a meaningful dashboard immediately after first launch, without needing OTel enabled

## 1.2 Secondary goal
Preserve the current OTel implementation, but reposition it as:

- optional live mode
- optional incremental source
- optional “now playing” style session activity feed

## 1.3 User-facing outcome
After this change, the app should:

1. discover Claude Code JSONL history on the machine
2. import historical usage into SQLite
3. render charts/heatmaps/sessions from imported JSONL-backed data
4. optionally listen for OTel live telemetry and append/update recent data
5. clearly show which data source is active:
   - JSONL imported
   - OTel connected
   - both

---

# 2. Product rules

## 2.1 Source priority
The application must treat data sources with the following priority:

### Primary source
- Claude Code local JSONL files

### Secondary source
- OTel live ingestion

The app must remain fully useful even if OTel is disabled or unavailable.

## 2.2 Local-first
All processing and storage remain local in v0.1/vNext:
- JSONL discovery is local
- JSONL parsing is local
- OTel collector is local
- SQLite is local

## 2.3 Graceful degradation
Supported combinations:

### Mode A: JSONL only
- supported
- fully usable
- default expected mode

### Mode B: OTel only
- supported for users who want live-only mode
- historical view may be partial

### Mode C: JSONL + OTel
- preferred “full experience”
- history from JSONL
- live augmentation from OTel

---

# 3. High-level architecture

## 3.1 Updated source model
The app now has two ingestion pipelines:

### Pipeline 1: JSONL importer
Responsible for:
- discovering Claude Code local files
- parsing JSONL entries
- normalizing them
- importing into SQLite
- incremental re-import / refresh

### Pipeline 2: OTel live ingestion
Responsible for:
- receiving live telemetry
- normalizing events/metrics
- writing to SQLite
- pushing realtime updates to UI

## 3.2 Updated system model
Core layers:

- Source discovery layer
- Source ingestion layer
- Normalization layer
- Storage layer
- Query/aggregation layer
- UI layer

The query/UI layers must not care whether data originally came from JSONL or OTel, except where explicitly shown in source status UX.

---

# 4. Data source strategy

## 4.1 JSONL as source of truth for history
Historical charts, sessions, and heatmap should primarily come from JSONL-imported data.

This means:

- first launch should trigger JSONL discovery/import
- dashboard should become useful immediately after import
- the app should not require telemetry configuration to show past usage

## 4.2 OTel as optional live augmentation
OTel should be treated as one of the following:

- live overlay for in-progress work
- supplemental source for near-real-time updates
- optional session activity feed

OTel should not be the only required path for a good UX.

## 4.3 Source transparency in UX
The UI must surface source status clearly:

Examples:
- `History imported from JSONL`
- `Live telemetry connected`
- `No live telemetry`
- `Last JSONL import: 2 minutes ago`
- `Last OTel event: just now`

---

# 5. Functional requirements

## 5.1 JSONL discovery
The application must attempt to discover Claude Code JSONL files automatically.

### Requirements
- scan known/default Claude Code storage locations per platform
- allow manual directory override in Settings
- validate candidate files before import
- show discovery results to the user

### UX
User should see:
- discovered path(s)
- number of files found
- last modified time
- import readiness state

## 5.2 JSONL import
The importer must:

- read JSONL records
- parse safely line-by-line
- tolerate malformed lines
- normalize supported records
- store raw source records when useful
- update aggregate tables
- support repeated re-imports without corrupting data

## 5.3 Incremental re-import
The importer must support incremental refresh.

Approach:
- track imported files
- track file offsets and/or content fingerprints
- import only new content when possible
- fall back to safe full re-import if needed

## 5.4 OTel ingestion retention
Existing OTel ingestion remains supported.

### Requirements
- app can still start local OTel collector
- collector remains localhost-only
- OTel writes into same normalized storage model
- UI can reflect recent live updates quickly

## 5.5 Source-aware merging
Data from JSONL and OTel must coexist safely.

The app must avoid:
- obvious duplicate double-counting
- source confusion
- broken session totals

A basic source-aware merge strategy is enough for this phase.

---

# 6. UX requirements

## 6.1 First launch experience
On first launch:

1. initialize DB
2. discover JSONL files
3. present import status
4. import available history
5. render dashboard from imported data
6. optionally prompt user to enable OTel live mode

The app should feel useful immediately after install.

## 6.2 Setup screen changes
The old setup flow likely emphasized OTel.
This must be updated.

### New setup priorities
1. JSONL history discovery/import
2. optional OTel live setup
3. source status overview

### Setup screen sections
- History source
- Import controls
- Live telemetry (optional)
- Troubleshooting

## 6.3 Dashboard source indicators
Dashboard should include lightweight source indicators:

- historical source active
- live source active/inactive
- last import time
- last live event time

Do not make source state visually noisy, but keep it transparent.

---

# 7. Data model changes

## 7.1 Core principle
Storage must become explicitly **source-aware**.

The app should know whether a record originated from:
- JSONL import
- OTel live ingestion

## 7.2 New/updated tables

### source_files
Tracks discovered/imported JSONL files.

Fields:
- id TEXT PRIMARY KEY
- path TEXT NOT NULL UNIQUE
- source_kind TEXT NOT NULL -- 'jsonl'
- discovered_at TEXT NOT NULL
- last_seen_at TEXT NOT NULL
- last_modified_at TEXT NULL
- file_size_bytes INTEGER NULL
- import_status TEXT NOT NULL
- last_imported_at TEXT NULL
- last_offset INTEGER DEFAULT 0
- fingerprint TEXT NULL
- metadata_json TEXT NULL

### source_records
Tracks imported source-level records for debugging/dedup/reference.

Fields:
- id TEXT PRIMARY KEY
- source_kind TEXT NOT NULL -- 'jsonl' | 'otel'
- source_file_id TEXT NULL
- source_record_key TEXT NULL
- source_timestamp TEXT NULL
- raw_payload_json TEXT NOT NULL
- imported_at TEXT NOT NULL
- normalized_entity_type TEXT NULL
- normalized_entity_id TEXT NULL

### imports
Tracks import runs.

Fields:
- id TEXT PRIMARY KEY
- source_kind TEXT NOT NULL -- 'jsonl'
- started_at TEXT NOT NULL
- finished_at TEXT NULL
- status TEXT NOT NULL
- files_scanned INTEGER DEFAULT 0
- records_read INTEGER DEFAULT 0
- records_imported INTEGER DEFAULT 0
- records_skipped INTEGER DEFAULT 0
- records_failed INTEGER DEFAULT 0
- error_summary TEXT NULL

### sessions
Add:
- primary_source_kind TEXT NULL
- source_confidence INTEGER DEFAULT 100
- import_first_seen_at TEXT NULL
- live_last_seen_at TEXT NULL

### metric_points
Add:
- source_kind TEXT NOT NULL -- 'jsonl' | 'otel'
- source_record_id TEXT NULL

### events_raw
Add:
- source_kind TEXT NOT NULL -- 'jsonl' | 'otel'
- source_record_id TEXT NULL

### daily_usage
No major structural change required, but values may be composed from mixed sources.
Add optional:
- jsonl_contributed INTEGER DEFAULT 0
- otel_contributed INTEGER DEFAULT 0

---

# 8. Normalization model

## 8.1 Shared normalized model
Even though ingestion comes from two different pipelines, both must normalize into the same internal domain as much as possible.

Main normalized entities:
- Session
- Usage event / metric point
- Daily aggregate
- Model aggregate

## 8.2 Source-kind tagging
Every normalized record must include source provenance.

Allowed values:
- `jsonl`
- `otel`

## 8.3 Raw payload retention
Keep raw payloads for:
- debugging
- future parser refinement
- data recovery

---

# 9. Import pipeline design

## 9.1 Discovery phase
Responsibilities:
- identify likely JSONL paths
- verify files exist
- register/update `source_files`

## 9.2 Parse phase
Responsibilities:
- stream file line-by-line
- parse JSON safely
- skip malformed lines
- produce structured intermediate records

## 9.3 Normalize phase
Responsibilities:
- extract session identifiers
- extract timestamps
- extract token/cost/model/tool information where available
- create source-aware normalized entities

## 9.4 Persist phase
Responsibilities:
- write source_records
- upsert sessions
- append metric/events
- update daily aggregates
- record import stats

## 9.5 Refresh phase
Responsibilities:
- incremental import of changed files
- recalculate affected aggregates if needed

---

# 10. Merge strategy between JSONL and OTel

## 10.1 Goal
Avoid obvious duplicate totals when both sources are active.

## 10.2 Practical rule for this phase
Use a simple and explicit strategy:

### Historical preference
- prefer JSONL for historical aggregates and session totals

### Live preference
- use OTel for most recent live activity and in-progress session freshness

### Merge window
Define a configurable recent time window, for example:
- last 5 minutes
- last 10 minutes
- last 15 minutes

Within this recent window:
- OTel may augment or temporarily represent activity
- once JSONL import catches up, JSONL becomes authoritative for persisted history views

## 10.3 UI interpretation rule
Dashboard totals for long ranges should prefer stable imported JSONL data.
Live widgets may show OTel-enhanced values for the current active period.

## 10.4 Simplicity over perfection
Do not build a highly complex reconciliation engine yet.
A clear, source-aware, mostly-correct merge model is acceptable.

---

# 11. Query layer requirements

## 11.1 Query behavior
All dashboard queries should work without OTel.

Queries must support:
- JSONL-only data
- OTel-only data
- combined data

## 11.2 Recommended query surfaces
- dashboard summary
- token timeseries
- cost timeseries
- heatmap
- sessions list
- session detail
- source status summary
- import history summary

## 11.3 Source filtering
Add optional source filters for debugging/admin UX:
- all
- jsonl only
- otel only

This is especially useful during development and troubleshooting.

---

# 12. UI changes

## 12.1 Dashboard
Dashboard should now be framed as:

- historical usage
- current/live activity
- source status

Suggested sections:
- summary cards
- token/cost charts
- heatmap
- recent sessions
- source health panel

## 12.2 New source health panel
Display:
- JSONL source discovered/not discovered
- number of files
- last import time
- last import result
- OTel collector running/stopped
- last OTel event time

## 12.3 Setup screen
Revise setup hierarchy:

### Section 1: Import history
- discovered paths
- rescan
- import now
- auto-import toggle if supported later

### Section 2: Enable live telemetry (optional)
- current collector status
- copy-paste OTel env vars
- verify live connection

### Section 3: Troubleshooting
- no files found
- malformed files
- collector not connected

## 12.4 Settings
Add:
- JSONL directory override
- auto-rescan toggle
- import behavior options
- live telemetry toggle
- merge window config if needed
- clear data

---

# 13. Command/API changes

## 13.1 New backend commands
Implement commands approximately like:

- `discover_jsonl_sources()`
- `list_jsonl_sources()`
- `run_jsonl_import(full: bool)`
- `get_import_history()`
- `get_source_status()`
- `set_jsonl_directory_override(path)`
- `rescan_sources()`

## 13.2 Existing commands to adapt
Existing dashboard/session queries should now work over source-aware storage:
- `get_dashboard_summary(range, sourceFilter?)`
- `get_token_timeseries(range, sourceFilter?)`
- `get_cost_timeseries(range, sourceFilter?)`
- `get_daily_heatmap(range, sourceFilter?)`
- `list_sessions(limit, offset, sourceFilter?)`
- `get_session_detail(sessionId)`

## 13.3 OTel commands remain
Keep:
- `get_collector_status()`
- `restart_collector()`
- `get_setup_instructions()`

But mark OTel as optional in returned UX text.

---

# 14. State model

## 14.1 App state
The app should track:
- JSONL discovery state
- current import state
- last successful import
- OTel collector state
- live connection state

## 14.2 Frontend refresh behavior
When JSONL import finishes:
- invalidate dashboard/session queries
- refresh source status
- update charts

When OTel data arrives:
- refresh live summary
- optionally refresh recent charts/session views

---

# 15. Error handling requirements

## 15.1 JSONL discovery errors
Handle:
- path not found
- permission denied
- unsupported path
- no files discovered

## 15.2 JSONL parse errors
Handle:
- malformed lines
- partial/corrupt files
- unknown record shapes

These must not crash import.
They should be counted and reported.

## 15.3 OTel errors
Keep current resilience expectations:
- malformed payloads do not crash app
- collector bind failures are surfaced clearly
- live mode failure does not block historical mode

## 15.4 Priority rule
Failure of OTel must never prevent JSONL-driven dashboard use.

---

# 16. Performance requirements

## 16.1 JSONL import
Importer must be streaming/iterative where possible.
Do not load huge files fully into memory if avoidable.

## 16.2 Incremental behavior
Repeated app launches should not require expensive full re-import unless necessary.

## 16.3 Query performance
Charts and heatmaps should query aggregates, not only raw records.

## 16.4 Reconciliation
Keep source merging simple and performant.

---

# 18. Migration plan

## 18.1 Existing application state
The app already has OTel ingestion and visualization.

## 18.2 Migration strategy
Implement in stages:

### Stage 1
- introduce source-aware schema changes
- add JSONL discovery/import backend
- import into existing normalized model

### Stage 2
- update queries to be source-aware
- make dashboard work from JSONL-only data

### Stage 3
- adapt setup screen and source health UX
- downgrade OTel from primary path to optional path

### Stage 4
- implement basic merge/reconciliation behavior
- polish incremental refresh and source indicators

## 18.3 Backward compatibility
Existing OTel-only users should still be able to run the app.
No hard dependency on JSONL discovery should block startup.

---

# 19. Acceptance criteria

The implementation is accepted when all of the following are true:

1. App can discover Claude Code JSONL history files automatically or via manual override.
2. App can import JSONL history into SQLite successfully.
3. Dashboard renders meaningful historical data without requiring OTel.
4. OTel remains optional and functional.
5. Source status is visible in the UI.
6. Historical charts and heatmap are primarily driven by JSONL-imported data.
7. Repeated imports do not obviously duplicate historical totals.
8. JSONL-only mode works cleanly.
9. OTel-only mode still works.
10. Combined mode works without obvious user confusion.
11. Import failures do not crash the app.
12. OTel failures do not block historical usage features.

---

# 20. Definition of done

This refactor is done when:

- JSONL is the primary historical source
- OTel is optional and additive
- the dashboard is useful immediately after JSONL import
- the source model is explicit and understandable
- the app remains local-first
- the user experience is simpler and stronger than the previous OTel-first version