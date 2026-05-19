# Worklog számítás pontosítása — elemzés és javaslatok

> **Státusz:** elemzés, döntés előtt. Még nincs konkrét implementációs plan — a user később tér vissza rá, és kiválaszt egy irányt a javaslatok közül.
>
> **Kapcsolódó plan:** `2026-05-04-timesheet-worklog.md` — az eredeti implementáció, amit ez pontosítana.

## Probléma

A jelenlegi worklog számítás nem tudja megkülönböztetni az alábbi két esetet, mert csak egy fix időablakot (`idle_threshold_seconds`, alap 5 min) használ:

1. **Engaged reading**: Az agent válasza után a user *olvassa* a választ — ez legitim user munkaidő, akár 8-10 perc is lehet egy hosszú/komplex válasznál.
2. **Abandoned session**: A user nem veszi észre a választ vagy elment a géptől, és a Claude órákig vár — ez **nem** munkaidő.

A kettő jelenleg ugyanúgy néz ki: mindkettőt 5 percre capeli a rendszer, így:
- Az olvasási idő alulbecsülődik (8 perc helyett 5).
- Az elhagyott sessionök 5 perc hamis munkaidőt kapnak gap-enként.

## Jelenlegi működés

Forrás: `src-tauri/src/jsonl/worklog.rs:18` — `calculate_worklog()`

- **Turn** = 1 user üzenet + minden rákövetkező assistant üzenet a következő user üzenetig.
- **`claude_seconds`** = user üzenet → utolsó assistant üzenet a turnben. Ez korrekt — ezt mérni tudjuk.
- **`user_seconds`** = előző turn utolsó assistant üzenete → aktuális user üzenet közötti gap, capelve `idle_threshold_seconds`-szel.
- **Cap**: globális, fix érték (default 300s, állítható: `SettingsPage.tsx:252`).

## Rendelkezésre álló adatforrások

A `SessionMessage` (`src-tauri/src/jsonl/types.rs:163`) már tartalmazza, ami egy okosabb becsléshez kell — nincs szükség új adat kinyerésére:

| Mező | Felhasználás |
|---|---|
| `output_tokens` | Assistant válasz hossza tokenben |
| `tool_use_count` | Tool hívások száma (sok tool ⇒ több olvasnivaló) |
| `content_text` / `content_blocks` | Karakter-/szószám kinyerhető |
| Turn pozíció a sessionben | Tudjuk, hogy az adott turn az utolsó-e |
| `is_meta` | Slash command-ek már szűrve |
| `isSidechain` | Task agent üzenetek már szűrve |

## Javaslatok

A javaslatok kombinálhatók. Sorrendben a hatás/komplexitás arány alapján:

### 1. Last-turn trailing gap → 0

Ha az utolsó turn után már nem jön user üzenet, nincs bizonyíték arra, hogy bárki dolgozott. A jelenlegi logikában ez nem is kerül be (mert `prev_assistant_end` után nincs következő user), de érdemes ellenőrizni, hogy session-határnál (újraindított session után) ne kapjon a user_seconds nagy értéket az új session első turn-jén csak azért, mert hosszú szünet után jött vissza.

**Ténylegesen az új session első turn-jénél a `user_seconds` mindig 0 a jelenlegi logikában**, mert `prev_assistant_end = None` a session elején — ez már jó. Tehát ez a pont gyakorlatban már működik, viszont **session-határon belül** (egy hosszú futó sessionön belül elhagyott szakaszokra) nem véd. Erre a 3. pont kell.

### 2. Dinamikus reading-cap a válasz komplexitása alapján

A statikus 5 perc helyett számítsunk válaszonként reading budget-et:

```
read_budget = clamp(
    base_min + output_tokens * sec_per_token + tool_count * sec_per_tool,
    soft_min,   // pl. 60s — rövid válasznál is adjunk gondolkodási időt
    hard_max    // pl. 30 perc — felette már nem hihető, hogy olvasott
)
user_seconds = min(raw_gap, read_budget)
```

**Tipikus paraméterezés** (induló javaslat, finomhangolható):
- ~250 wpm olvasási sebesség ≈ 5 char/sec ≈ ~1 token/sec olvasásra
- `sec_per_token` ≈ 1.0
- `sec_per_tool` ≈ 5–10 (tool output review)
- `base_min` ≈ 30s
- `soft_min` ≈ 60s
- `hard_max` ≈ 1800s (30 min)

**Példák:**
- 100 tokenes válasz, 0 tool → ~130s budget → ~2 perc
- 2000 tokenes válasz, 5 tool → ~2050s + 25s → capelve 1800s-re (30 min)
- Egy "OK" → 30s + 0 → soft_min (60s)

**Migráció:** a meglévő `idle_threshold_seconds` setting maradhat `hard_max`-ként; a többi paraméter induljon hardcoded-an, később kerülhetnek a Settings-be.

### 3. Két-szintű cap: "engaged" vs "abandoned"

A 2. ponttal együtt:

- **Engaged sáv**: `gap ≤ read_budget` → **teljes gap számít** (user olvasott)
- **Soft cap sáv**: `read_budget < gap ≤ 2 × read_budget` → reading_budget-re capelve (még hihető, hogy a gépnél volt, csak megakadt)
- **Abandoned sáv**: `gap > 2 × read_budget` → **0** vagy fix kis érték (`base_min`) — nyilvánvalóan elhagyta a gépet

Ez érinti a session-en belüli elhagyott szakaszokat (1. pont nem véd ezektől).

### 4. UI: turn-szintű "miért ennyi" magyarázat

A `TurnWorklog` (`types.rs:215`) már tárolja a `user_capped: bool` flag-et. Bővíteni:

```rust
pub struct TurnWorklog {
    // ...meglévők
    pub cap_reason: Option<String>, // "read_budget" | "abandoned" | "session_start" | null
    pub read_budget_seconds: i64,   // debug: mennyi volt a budget ennél a turn-nél
    pub raw_gap_seconds: i64,       // debug: mennyi volt a nyers gap
}
```

A `DayWorklogDialog`-ban / `SessionDetailPanel`-en jelenítsük meg, melyik turnnél mi történt — bizalmat ad a számokhoz, és könnyen finomhangolható, ha a user észreveszi, hogy egy konkrét eset rosszul becsül.

### 5. (Opcionális, későbbre) Felhasználói "AFK" jelzés

Egy explicit gomb / `claude /afk`-szerű marker, amivel a user maga jelezheti, hogy lemegy a géptől. Csak akkor érdemes implementálni, ha a heurisztikák (2.+3.) önmagukban nem elég pontosak. Először mérjük a heurisztikák minőségét konkrét sessionökön, és csak utána mérlegeljük.

## Javasolt sorrend

1. **2. pont** — dinamikus read_budget bevezetése paraméterezhető konstansokkal. Tesztek konkrét fixture sessionökre (rövid válasz, hosszú válasz, sok tool).
2. **3. pont** — két-szintű cap az abandoned sáv kezelésére.
3. **4. pont** — debug információ a UI-on (transzparencia, finomhangolás támogatása).
4. **Mérés** — futtassuk a régi és új algoritmust a meglévő adatokon, hasonlítsuk össze az aggregált napi értékeket. Ahol nagy az eltérés, manuálisan ellenőrizni a turn-ek listáját.
5. **Beállítások UI** — ha a paraméterezésen finomítani kell, kerüljön ki a Settings-be (a `hard_max` már kint van mint `idle_threshold_seconds`).
6. **5. pont** csak ha a fenti mérés azt mutatja, hogy a heurisztika nem elég.

## Megjegyzés

A `claude_seconds` számítása változatlan marad — az nem érintett, mert direkt méréssel megy (user üzenet → utolsó assistant üzenet a turnben). Csak a `user_seconds` becslését pontosítjuk.
