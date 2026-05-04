# Worklog átalakítás: csak Claude Code idő, tű pontos méréssel

**Cél:** A worklog feature-ből távolítsuk el a user-idő számítást és megjelenítést. A megmaradó Claude-idő legyen tű pontos: a valódi user üzenettől az utolsó assistant válasz tényleges befejezéséig tartó wall clock, tool execution beleértve.

**Indok:** A jelenlegi implementáció két problémája:
1. A user-idő (`user_work_seconds`) heurisztikus, fix idle-cappel becsült érték — nem megbízható, és félrevezető a "worklog" elnevezéssel.
2. A `claude_work_seconds` is pontatlan: tool_result user üzenetek mesterségesen szétdarabolják a turn-eket (a tool execution idő a user_seconds-be kerül és capelve lesz), és az assistant entry-k merge-nél a legkorábbi timestamp marad meg, ami alulbecsüli a generálás végét.

A megoldás egyszerre **leszűkíti** a feature-t (csak Claude idő) és **pontosítja** a mérést.

## Algoritmus

### Turn definíció

**Real user message** = `role == "user"` ÉS `is_meta == false` ÉS `is_sidechain == false` ÉS `content_text` nem `None` és nem üres string.

A tool_result user üzeneteknek nincs text blokkjuk, így a `extract_session_messages` `content_text = None`-t ad nekik. Ez a természetes detektálás — nem kell külön content-typing.

**Turn** = egy real user message + minden rákövetkező assistant és tool_result message, a következő real user message-ig (vagy a session végéig).

Egy turn átölelhet több Claude generálási ciklust (request_id-t), ha a response tool-okat használt.

### Claude time számítás

Per turn:
```
claude_seconds = last_assistant.end_timestamp - real_user.timestamp
```

- **Nincs cap, nincs heurisztika.** A wall clock a real user üzenettől a turn utolsó assistant message-ének tényleges befejezéséig tart.
- Tool execution idő (assistant tool_use → tool_result közötti gap) **beletartozik** a Claude időbe — ez Claude Code aktív működése.
- Ha egy turn-ben nincs assistant message (pl. user megszakítva), `claude_seconds = 0`.

### Multi-day split

A meglévő `split_seconds_by_day` logika változatlan: ha egy turn átlépi a UTC éjfélt, a másodperceket arányosan osztjuk a két nap között. A turn count viszont a real user message napjához tartozik (változatlan).

## Backend

### `src-tauri/src/jsonl/types.rs`

**`SessionMessage` bővítés:**
```rust
pub struct SessionMessage {
    pub role: String,
    pub timestamp: Option<String>,
    pub end_timestamp: Option<String>,  // ÚJ — assistanton a merged entry-k legkésőbbi timestampje
    pub content_text: Option<String>,
    // ...többi mező változatlan
}
```

User üzeneteken `end_timestamp = None` (vagy `= timestamp`, kódban kényelmesebb úgy kezelni — döntés implementációkor; semantikailag ugyanaz, mert egy user entry nem mergel).

**`WorklogRow` szűkítés:**
```rust
pub struct WorklogRow {
    pub session_id: String,
    pub project_path: Option<String>,
    pub day: String,
    pub claude_work_seconds: i64,  // marad
    pub turn_count: i64,           // marad
    // user_work_seconds — TÖRÖLVE
}
```

**`TurnWorklog` szűkítés:**
```rust
pub struct TurnWorklog {
    pub index: i64,
    pub user_message_at: String,
    pub last_assistant_at: String,  // most az end_timestamp értéke
    pub claude_seconds: i64,
    // user_seconds — TÖRÖLVE
    // user_capped — TÖRÖLVE
}
```

### `src-tauri/src/jsonl/normalize.rs`

`extract_session_messages` merge logikájának módosítása. Jelenleg a request_id-szerinti merge csak a legkorábbi timestampet tartja meg; bővítsük úgy, hogy a legkésőbbit is tárolja, és kerüljön a kimeneti `SessionMessage.end_timestamp` mezőbe.

Pszeudo:
```
PendingAssistantTurn {
    timestamp: Option<String>,        // legkorábbi (meglévő)
    end_timestamp: Option<String>,    // ÚJ: legkésőbbi
    ...
}

mergenél:
    if a.timestamp < turn.timestamp { turn.timestamp = a.timestamp.clone(); }
    if turn.end_timestamp.is_none() || a.timestamp > turn.end_timestamp { turn.end_timestamp = a.timestamp.clone(); }
```

User entry-knél `end_timestamp = u.timestamp.clone()` (single timestamp, nincs merge).

### `src-tauri/src/jsonl/worklog.rs` (rewrite)

**`is_real_user_message(msg) -> bool`** új helper: `role == "user"` ÉS `is_meta == false` ÉS `is_sidechain == false` ÉS `content_text` valamilyen nem-üres string.

**`build_turns` átírva:**
```rust
struct Turn {
    user_at: DateTime<Utc>,
    last_assistant_end: DateTime<Utc>,  // 'last_assistant_at' helyett
}

for msg in messages:
    if sidechain || is_meta: continue
    
    match role:
        "user":
            if is_real_user(msg):
                close current turn if any
                start new Turn { user_at, last_assistant_end: user_at }
            else:
                // tool_result vagy üres user — ignoráljuk a turn boundary szempontjából
                continue
        "assistant":
            if let Some(t) = current.as_mut():
                let end = parse_ts(msg.end_timestamp).unwrap_or(parse_ts(msg.timestamp));
                if end > t.last_assistant_end:
                    t.last_assistant_end = end;
            // assistant real user előtt → orphan, ignoráljuk (meglévő viselkedés)
```

**`calculate_worklog` átírva:**
- `idle_threshold_seconds` paraméter **törölve** a signature-ből.
- Nincs `prev_assistant_end` állapot, nincs user_seconds számítás.
- Per turn: `claude_seconds = last_assistant_end - user_at` (max 0).
- Multi-day split a turn user_at-ból user_at + claude_seconds intervallumra (a midnight-split helper változatlan, csak claude_seconds-re hívva).
- `WorklogRow` és `TurnWorklog` az új, szűkebb shape-pel.

### `src-tauri/src/db/migrations.rs`

**V11 migráció:**
1. SQLite ALTER nem támogatja a column drop-ot egyszerűen, így `worklogs` tábla recreate:
   ```sql
   CREATE TABLE worklogs_new (
       session_id TEXT NOT NULL,
       project_path TEXT,
       day TEXT NOT NULL,
       claude_work_seconds INTEGER NOT NULL DEFAULT 0,
       turn_count INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (session_id, day)
   );
   DROP TABLE worklogs;
   ALTER TABLE worklogs_new RENAME TO worklogs;
   -- (indexek újra létrehozva)
   ```
2. `DELETE FROM app_state WHERE key = 'idle_threshold_seconds';`
3. A worklogs tábla üres a recreate után — a következő import / explicit recompute újratölti.

### `src-tauri/src/db/mod.rs` és parancsok

- DB query-kben (read és write) a `user_work_seconds` mező eltávolítva.
- A worklog read parancsok (`get_session_worklog`, stb.) a szűkebb `WorklogRow` shape-et adják vissza.
- `get_idle_threshold_minutes` és `update_idle_threshold_minutes` parancsok **törölve**.
- `recompute_worklogs` parancs marad (manuális trigger lehetőségként).
- `lib.rs`-ben a törölt parancsok regisztrációja eltávolítva.

### `src-tauri/src/jsonl/import.rs`

- `calculate_worklog` hívás az új signature-rel (idle_threshold paraméter eldobva).
- Az `idle_threshold_seconds` setting olvasása az importban — törölve.

## Frontend

### `src/types/index.ts`

`Worklog*` típusokból minden user-related mező törölve:
- `user_work_seconds` a `WorklogRow`-ból
- `user_seconds`, `user_capped` a `TurnWorklog`-ból
- `total_user_seconds` a session/dashboard összesítő típusokból (a hookok visszatérési shape-jeiből — pl. `useSessionWorklog`, `useDashboardWorklog`, `useSessionWorklogs`). A `total_claude_seconds` marad.

### `src/lib/tauri.ts`

- `getIdleThresholdMinutes`, `updateIdleThresholdMinutes` wrapper-ek **törölve**.
- A többi worklog wrapper return-type-ja a szűkebb shape.

### `src/components/ui/WorklogPair.tsx` → **TÖRÖLVE**

Helyette: a használati helyeken közvetlenül `formatDuration(claude_work_seconds)`. Egy egyszerű span-elem elég, nem kell külön komponens.

### Felhasználói helyek (mind érintett)

- `src/features/dashboard/BentoSummary.tsx` — `WorklogBentoCard` egy értéket mutat. A 3-oszlopos grid (ha volt) átalakítva 2-oszloposra vagy egyértékű card-dá.
- `src/features/dashboard/WorklogBentoCard.tsx` — csak Claude idő.
- `src/features/dashboard/DailyHeatmap.tsx` — nem tartalmaz worklog adatot közvetlenül, csak a `DayWorklogDialog`-ot nyitja; nincs változás itt.
- `src/features/dashboard/DayWorklogDialog.tsx` — a turn-ek listájából user oszlop eltávolítva, csak Claude idő.
- `src/features/dashboard/ExpandedWidgetChart.tsx` — worklog widget egy adatsoros (nem stacked).
- `src/features/sessions/SessionsList.tsx` — `WorklogPair` helyett egyszerű duration label.
- `src/features/sessions/SessionDetailPanel.tsx` — Worklog szekció csak Claude időt mutatja.

### `src/pages/SettingsPage.tsx`

"User Idle Threshold" szekció **törölve**: az import-ok, az állapot (`idleMinutes`, `savingIdle`), a `useEffect`, az `onIdleSave` handler, és a JSX. A `recomputeWorklogs` trigger maradhat egy külön (manuális) gomb mögött, vagy törölhető — javaslat: hagyjuk benne dev/debug okból, "Recompute worklogs" gombbal.

### Hook-ok

- `useDayWorklog`, `useSessionWorklog`, `useDashboardWorklog`, `useSessionWorklogs`, `useSessionWorklogTurns`: visszatérési típusok a szűkebb shape-pel; user-related field referenciák kivéve.

## Tesztek

### Backend unit tesztek (`worklog.rs`)

A meglévő test suite átírva az új viselkedésre:

1. **`single_turn_one_assistant`** — user@10:00, assistant end@10:00:30 → claude_seconds=30, turn_count=1.
2. **`tool_chain_turn_includes_tool_exec`** — user@10:00 → assistant tool_use@10:00:05 → tool_result user@10:00:35 → assistant text end@10:00:40 → **claude_seconds=40** (tool exec beleértve, NEM 5+5=10).
3. **`tool_result_does_not_break_turn`** — több tool_result közötti gap is benne van a claude_seconds-ben; egy turn marad, nem három.
4. **`multi_day_turn_splits_at_midnight`** — meglévő, end_timestamp-et használva.
5. **`is_meta_skipped`** — meta user üzenet ignorálva, nem zár új turn-t.
6. **`sidechain_skipped`** — sidechain message ignorálva.
7. **`assistant_end_uses_latest_timestamp`** — merged assistant entry-knél a legkésőbbi timestamp ad end-et; szintetikus teszt SessionMessage-ekkel, ahol az `end_timestamp` később van mint a `timestamp`.
8. **`empty_user_content_treated_as_tool_result`** — `content_text = None` user üzenet nem indít új turn-t.
9. **`empty_input_returns_empty`** — meglévő.
10. **`assistant_before_real_user_is_ignored`** — orphan assistant ignorálva.

### Backend extract_session_messages tesztek (`normalize.rs`)

- **`assistant_end_timestamp_is_latest_of_merged_entries`** — szintetikus raw entry input, ahol egy request_id-hez két assistant entry tartozik különböző timestamppel; a kimeneti SessionMessage `timestamp` = legkorábbi, `end_timestamp` = legkésőbbi.

### Frontend

- `npm run typecheck` zöld — a típusváltozások végigmennek.
- `npm run build` zöld.
- Smoke teszt manuálisan: dashboard, sessions list, session detail panel, day worklog dialog megnyílik, csak Claude időt mutat.

## Migráció és roll-out

1. V11 schema migráció lefut app indításkor (worklogs táblát újrahozzuk, idle_threshold beállítást töröljük).
2. A worklogs tábla üres → első sessionList olvasáskor / dashboard query-nél a backend recompute-ja triggerel (vagy explicit `recompute_worklogs` hívás app start után).
3. User-facing változás: a meglévő dashboardon és session view-kon a "user" idő eltűnik, a Claude idő értéke valamelyest megnő (mert most már a tool execution beleszámít).

## Mi NINCS benne (YAGNI)

- Nincs külön "model generation time" vs "tool execution time" megbontás.
- Nincs idle cap.
- Nincs explicit "real user message" mező a JSONL parserben — a `content_text.is_none()` heurisztika elég (a tool_result blokkok nem text-ek).
- Nincs backward-compat shim a régi `user_work_seconds`-re a frontenden — egyszerre megy a hátsó és előtér.
- Nincs adatmegőrzés a régi worklog adatokra (DELETE + recompute).

## Érintett fájlok összefoglaló

**Backend:**
- `src-tauri/src/jsonl/types.rs` (módosít)
- `src-tauri/src/jsonl/normalize.rs` (módosít)
- `src-tauri/src/jsonl/worklog.rs` (rewrite)
- `src-tauri/src/jsonl/import.rs` (módosít)
- `src-tauri/src/db/migrations.rs` (új V11)
- `src-tauri/src/db/mod.rs` (módosít)
- `src-tauri/src/commands/worklog.rs` (módosít)
- `src-tauri/src/commands/settings.rs` (módosít — idle threshold parancsok törölve)
- `src-tauri/src/commands/mod.rs` (módosít — re-export tisztítás)
- `src-tauri/src/lib.rs` (módosít — parancs regisztráció tisztítás)

**Frontend:**
- `src/types/index.ts` (módosít)
- `src/lib/tauri.ts` (módosít)
- `src/components/ui/WorklogPair.tsx` (törölve)
- `src/features/dashboard/BentoSummary.tsx` (módosít)
- `src/features/dashboard/WorklogBentoCard.tsx` (módosít)
- `src/features/dashboard/DailyHeatmap.tsx` (módosít, ha érintett)
- `src/features/dashboard/DayWorklogDialog.tsx` (módosít)
- `src/features/dashboard/ExpandedWidgetChart.tsx` (módosít)
- `src/features/sessions/SessionsList.tsx` (módosít)
- `src/features/sessions/SessionDetailPanel.tsx` (módosít)
- `src/pages/SettingsPage.tsx` (módosít)
- `src/hooks/useDayWorklog.ts` (módosít)
- `src/hooks/useSessionWorklog.ts` (módosít)
- `src/hooks/useDashboardWorklog.ts` (módosít)
- `src/hooks/useSessionWorklogs.ts` (módosít)
- `src/hooks/useSessionWorklogTurns.ts` (módosít)
