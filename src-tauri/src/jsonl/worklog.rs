use chrono::{DateTime, TimeZone, Utc};

use super::types::{SessionMessage, TurnWorklog, WorklogRow};

/// A turn = one user message + all subsequent assistant messages until the next user message.
struct Turn {
    user_at: DateTime<Utc>,
    last_assistant_at: DateTime<Utc>,
}

/// Compute worklog rows (per day) from already-extracted SessionMessage list.
///
/// - `messages` must be sorted by timestamp ascending (caller responsibility).
/// - `idle_threshold_seconds` caps the user gap between turns. The first turn's
///   user_seconds is always 0 (no preceding turn).
/// - Sidechain and is_meta messages are ignored.
/// - Multi-day turns are split at UTC midnight; each day gets its share of seconds.
pub fn calculate_worklog(
    messages: &[SessionMessage],
    idle_threshold_seconds: i64,
    project_path: Option<&str>,
    session_id: &str,
) -> (Vec<WorklogRow>, Vec<TurnWorklog>) {
    let turns = build_turns(messages);
    if turns.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut per_day: std::collections::HashMap<String, (i64, i64, i64)> =
        std::collections::HashMap::new();
    let mut turn_breakdowns: Vec<TurnWorklog> = Vec::with_capacity(turns.len());

    let mut prev_assistant_end: Option<DateTime<Utc>> = None;

    for (i, turn) in turns.iter().enumerate() {
        // User work (gap before this turn's user message)
        let (user_seconds, user_capped) = match prev_assistant_end {
            None => (0i64, false),
            Some(prev) => {
                let raw = (turn.user_at - prev).num_seconds().max(0);
                if raw > idle_threshold_seconds {
                    (idle_threshold_seconds, true)
                } else {
                    (raw, false)
                }
            }
        };

        // Claude work (user → last assistant in this turn)
        let claude_seconds = (turn.last_assistant_at - turn.user_at).num_seconds().max(0);

        // Bucket user_seconds onto the user_at day
        let user_day = day_key(turn.user_at);
        bucket_add(&mut per_day, &user_day, user_seconds, 0, 0);

        // Split claude_seconds across days if turn crosses midnight
        for (day, secs) in split_seconds_by_day(turn.user_at, turn.last_assistant_at) {
            bucket_add(&mut per_day, &day, 0, secs, 0);
        }

        // Count this turn against the user_at day
        bucket_add(&mut per_day, &user_day, 0, 0, 1);

        turn_breakdowns.push(TurnWorklog {
            index: (i as i64) + 1,
            user_message_at: turn.user_at.to_rfc3339(),
            last_assistant_at: turn.last_assistant_at.to_rfc3339(),
            user_seconds,
            claude_seconds,
            user_capped,
        });

        prev_assistant_end = Some(turn.last_assistant_at);
    }

    let mut rows: Vec<WorklogRow> = per_day
        .into_iter()
        .map(|(day, (u, c, t))| WorklogRow {
            session_id: session_id.to_string(),
            project_path: project_path.map(|s| s.to_string()),
            day,
            user_work_seconds: u,
            claude_work_seconds: c,
            turn_count: t,
        })
        .collect();

    rows.sort_by(|a, b| a.day.cmp(&b.day));
    (rows, turn_breakdowns)
}

fn build_turns(messages: &[SessionMessage]) -> Vec<Turn> {
    let mut turns: Vec<Turn> = Vec::new();
    let mut current: Option<Turn> = None;

    for msg in messages {
        // Skip sidechain and meta — they distort turn detection.
        let sidechain = msg
            .metadata
            .as_ref()
            .map(|m| m.is_sidechain)
            .unwrap_or(false);
        if sidechain || msg.is_meta {
            continue;
        }

        let ts = match parse_ts(msg.timestamp.as_deref()) {
            Some(t) => t,
            None => continue,
        };

        match msg.role.as_str() {
            "user" => {
                if let Some(t) = current.take() {
                    turns.push(t);
                }
                current = Some(Turn {
                    user_at: ts,
                    last_assistant_at: ts,
                });
            }
            "assistant" => {
                if let Some(t) = current.as_mut() {
                    if ts > t.last_assistant_at {
                        t.last_assistant_at = ts;
                    }
                }
                // assistant before any user → ignore (orphan)
            }
            _ => {}
        }
    }

    if let Some(t) = current {
        turns.push(t);
    }

    turns
}

fn parse_ts(ts: Option<&str>) -> Option<DateTime<Utc>> {
    let s = ts?;
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn day_key(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d").to_string()
}

fn bucket_add(
    map: &mut std::collections::HashMap<String, (i64, i64, i64)>,
    day: &str,
    user: i64,
    claude: i64,
    turns: i64,
) {
    let entry = map.entry(day.to_string()).or_insert((0, 0, 0));
    entry.0 += user;
    entry.1 += claude;
    entry.2 += turns;
}

/// Split [start, end] into per-UTC-day chunks, returning (day, seconds) pairs.
fn split_seconds_by_day(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Vec<(String, i64)> {
    if end <= start {
        return vec![(day_key(start), 0)];
    }

    let mut out: Vec<(String, i64)> = Vec::new();
    let mut cursor = start;
    while cursor < end {
        let next_midnight = next_utc_midnight(cursor);
        let chunk_end = if next_midnight < end {
            next_midnight
        } else {
            end
        };
        let secs = (chunk_end - cursor).num_seconds().max(0);
        out.push((day_key(cursor), secs));
        cursor = chunk_end;
    }
    out
}

fn next_utc_midnight(dt: DateTime<Utc>) -> DateTime<Utc> {
    let date = dt.date_naive() + chrono::Duration::days(1);
    Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jsonl::types::{MessageMetadata, SessionMessage};

    fn msg(role: &str, ts: &str, sidechain: bool, meta: bool) -> SessionMessage {
        SessionMessage {
            role: role.to_string(),
            timestamp: Some(ts.to_string()),
            content_text: None,
            content_blocks: Vec::new(),
            metadata: Some(MessageMetadata {
                cwd: None,
                git_branch: None,
                version: None,
                is_sidechain: sidechain,
            }),
            model: None,
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            cost_usd: 0.0,
            tool_use_count: 0,
            is_meta: meta,
        }
    }

    #[test]
    fn single_turn_one_assistant() {
        let msgs = vec![
            msg("user", "2026-05-04T10:00:00Z", false, false),
            msg("assistant", "2026-05-04T10:00:30Z", false, false),
        ];
        let (rows, turns) = calculate_worklog(&msgs, 300, Some("p"), "s1");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].user_work_seconds, 0);
        assert_eq!(rows[0].claude_work_seconds, 30);
        assert_eq!(rows[0].turn_count, 1);
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].user_seconds, 0);
        assert_eq!(turns[0].claude_seconds, 30);
        assert!(!turns[0].user_capped);
    }

    #[test]
    fn tool_chain_turn_uses_last_assistant() {
        let msgs = vec![
            msg("user", "2026-05-04T10:00:00Z", false, false),
            msg("assistant", "2026-05-04T10:00:30Z", false, false),
            msg("assistant", "2026-05-04T10:01:00Z", false, false),
            msg("assistant", "2026-05-04T10:02:00Z", false, false),
        ];
        let (rows, _) = calculate_worklog(&msgs, 300, None, "s");
        assert_eq!(rows[0].claude_work_seconds, 120);
    }

    #[test]
    fn user_idle_capped_at_threshold() {
        let msgs = vec![
            msg("user", "2026-05-04T10:00:00Z", false, false),
            msg("assistant", "2026-05-04T10:00:30Z", false, false),
            // 30-minute gap before next user — should cap at 300 sec
            msg("user", "2026-05-04T10:30:30Z", false, false),
            msg("assistant", "2026-05-04T10:31:00Z", false, false),
        ];
        let (rows, turns) = calculate_worklog(&msgs, 300, None, "s");
        // First turn: user=0, claude=30
        // Second turn: user=300 (capped from 1800), claude=30
        assert_eq!(rows[0].user_work_seconds, 300);
        assert_eq!(rows[0].claude_work_seconds, 60);
        assert!(turns[1].user_capped);
        assert_eq!(turns[1].user_seconds, 300);
    }

    #[test]
    fn multi_day_turn_splits_at_midnight() {
        let msgs = vec![
            msg("user", "2026-05-04T23:55:00Z", false, false),
            msg("assistant", "2026-05-05T00:30:00Z", false, false),
        ];
        let (rows, _) = calculate_worklog(&msgs, 300, None, "s");
        assert_eq!(rows.len(), 2);
        let r0 = rows.iter().find(|r| r.day == "2026-05-04").unwrap();
        let r1 = rows.iter().find(|r| r.day == "2026-05-05").unwrap();
        assert_eq!(r0.claude_work_seconds, 5 * 60);
        assert_eq!(r1.claude_work_seconds, 30 * 60);
    }

    #[test]
    fn empty_input_returns_empty() {
        let (rows, turns) = calculate_worklog(&[], 300, None, "s");
        assert!(rows.is_empty());
        assert!(turns.is_empty());
    }

    #[test]
    fn assistant_before_user_is_ignored() {
        let msgs = vec![
            msg("assistant", "2026-05-04T10:00:00Z", false, false),
            msg("user", "2026-05-04T10:01:00Z", false, false),
            msg("assistant", "2026-05-04T10:02:00Z", false, false),
        ];
        let (rows, turns) = calculate_worklog(&msgs, 300, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 60);
    }

    #[test]
    fn sidechain_and_meta_skipped() {
        let msgs = vec![
            msg("user", "2026-05-04T10:00:00Z", false, false),
            msg("assistant", "2026-05-04T10:00:30Z", true, false),  // sidechain — skipped
            msg("user", "2026-05-04T10:01:00Z", false, true),       // meta — skipped
            msg("assistant", "2026-05-04T10:02:00Z", false, false),
        ];
        let (rows, _) = calculate_worklog(&msgs, 300, None, "s");
        // Only 1 valid turn: user@10:00 → assistant@10:02
        assert_eq!(rows[0].turn_count, 1);
        assert_eq!(rows[0].claude_work_seconds, 120);
    }
}
