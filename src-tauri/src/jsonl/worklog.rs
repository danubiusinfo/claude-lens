use chrono::{DateTime, TimeZone, Utc};

use super::types::{SessionMessage, TurnWorklog, WorklogRow};

/// A turn = one real user message + all subsequent assistant + tool_result
/// messages until the next real user message. Tool_result user messages
/// (whose content_text is None / empty) do not break turns.
struct Turn {
    user_at: DateTime<Utc>,
    last_assistant_end: DateTime<Utc>,
}

/// Compute worklog rows (per day) from already-extracted SessionMessage list.
///
/// - `messages` must be sorted by timestamp ascending (caller responsibility).
/// - Sidechain and is_meta messages are ignored.
/// - User messages with no text content (tool_result) do not start a new turn.
/// - claude_seconds per turn = real_user.timestamp → last_assistant.end_timestamp.
/// - Multi-day turns are split at UTC midnight; each day gets its share of seconds.
pub fn calculate_worklog(
    messages: &[SessionMessage],
    project_path: Option<&str>,
    session_id: &str,
) -> (Vec<WorklogRow>, Vec<TurnWorklog>) {
    let turns = build_turns(messages);
    if turns.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut per_day: std::collections::HashMap<String, (i64, i64)> =
        std::collections::HashMap::new();
    let mut turn_breakdowns: Vec<TurnWorklog> = Vec::with_capacity(turns.len());

    for (i, turn) in turns.iter().enumerate() {
        let claude_seconds = (turn.last_assistant_end - turn.user_at)
            .num_seconds()
            .max(0);

        let user_day = day_key(turn.user_at);

        for (day, secs) in split_seconds_by_day(turn.user_at, turn.last_assistant_end) {
            bucket_add(&mut per_day, &day, secs, 0);
        }
        bucket_add(&mut per_day, &user_day, 0, 1);

        turn_breakdowns.push(TurnWorklog {
            index: (i as i64) + 1,
            user_message_at: turn.user_at.to_rfc3339(),
            last_assistant_at: turn.last_assistant_end.to_rfc3339(),
            claude_seconds,
        });
    }

    let mut rows: Vec<WorklogRow> = per_day
        .into_iter()
        .map(|(day, (c, t))| WorklogRow {
            session_id: session_id.to_string(),
            project_path: project_path.map(|s| s.to_string()),
            day,
            claude_work_seconds: c,
            turn_count: t,
        })
        .collect();

    rows.sort_by(|a, b| a.day.cmp(&b.day));
    (rows, turn_breakdowns)
}

fn is_real_user_message(msg: &SessionMessage) -> bool {
    if msg.role != "user" {
        return false;
    }
    if msg.is_meta {
        return false;
    }
    let sidechain = msg
        .metadata
        .as_ref()
        .map(|m| m.is_sidechain)
        .unwrap_or(false);
    if sidechain {
        return false;
    }
    match msg.content_text.as_deref() {
        Some(s) if !s.is_empty() => true,
        _ => false,
    }
}

fn build_turns(messages: &[SessionMessage]) -> Vec<Turn> {
    let mut turns: Vec<Turn> = Vec::new();
    let mut current: Option<Turn> = None;

    for msg in messages {
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
                if !is_real_user_message(msg) {
                    // tool_result or empty user — does not start a new turn
                    continue;
                }
                if let Some(t) = current.take() {
                    turns.push(t);
                }
                current = Some(Turn {
                    user_at: ts,
                    last_assistant_end: ts,
                });
            }
            "assistant" => {
                if let Some(t) = current.as_mut() {
                    let end_ts = parse_ts(msg.end_timestamp.as_deref())
                        .or_else(|| parse_ts(msg.timestamp.as_deref()))
                        .unwrap_or(ts);
                    if end_ts > t.last_assistant_end {
                        t.last_assistant_end = end_ts;
                    }
                }
                // assistant before any real user — orphan, ignore
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
    map: &mut std::collections::HashMap<String, (i64, i64)>,
    day: &str,
    claude: i64,
    turns: i64,
) {
    let entry = map.entry(day.to_string()).or_insert((0, 0));
    entry.0 += claude;
    entry.1 += turns;
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

    fn user_msg(ts: &str, text: Option<&str>, sidechain: bool, meta: bool) -> SessionMessage {
        SessionMessage {
            role: "user".to_string(),
            timestamp: Some(ts.to_string()),
            end_timestamp: Some(ts.to_string()),
            content_text: text.map(|s| s.to_string()),
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

    fn asst_msg(start: &str, end: &str) -> SessionMessage {
        SessionMessage {
            role: "assistant".to_string(),
            timestamp: Some(start.to_string()),
            end_timestamp: Some(end.to_string()),
            content_text: None,
            content_blocks: Vec::new(),
            metadata: Some(MessageMetadata {
                cwd: None,
                git_branch: None,
                version: None,
                is_sidechain: false,
            }),
            model: None,
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            cost_usd: 0.0,
            tool_use_count: 0,
            is_meta: false,
        }
    }

    #[test]
    fn single_turn_one_assistant() {
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("hello"), false, false),
            asst_msg("2026-05-04T10:00:05Z", "2026-05-04T10:00:30Z"),
        ];
        let (rows, turns) = calculate_worklog(&msgs, Some("p"), "s1");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 30);
        assert_eq!(rows[0].turn_count, 1);
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].claude_seconds, 30);
    }

    #[test]
    fn tool_chain_turn_includes_tool_exec() {
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("do X"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:05Z"),
            user_msg("2026-05-04T10:00:35Z", None, false, false),
            asst_msg("2026-05-04T10:00:36Z", "2026-05-04T10:00:40Z"),
        ];
        let (rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 40);
        assert_eq!(rows[0].turn_count, 1);
    }

    #[test]
    fn tool_result_does_not_break_turn() {
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("multi-tool"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:02Z"),
            user_msg("2026-05-04T10:00:10Z", None, false, false),
            asst_msg("2026-05-04T10:00:11Z", "2026-05-04T10:00:12Z"),
            user_msg("2026-05-04T10:00:20Z", None, false, false),
            asst_msg("2026-05-04T10:00:21Z", "2026-05-04T10:00:25Z"),
        ];
        let (_rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].claude_seconds, 25);
    }

    #[test]
    fn empty_user_content_treated_as_tool_result() {
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("real"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:05Z"),
            user_msg("2026-05-04T10:00:10Z", Some(""), false, false),
            asst_msg("2026-05-04T10:00:11Z", "2026-05-04T10:00:15Z"),
        ];
        let (_rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].claude_seconds, 15);
    }

    #[test]
    fn multi_day_turn_splits_at_midnight() {
        let msgs = vec![
            user_msg("2026-05-04T23:55:00Z", Some("late"), false, false),
            asst_msg("2026-05-04T23:56:00Z", "2026-05-05T00:30:00Z"),
        ];
        let (rows, _) = calculate_worklog(&msgs, None, "s");
        assert_eq!(rows.len(), 2);
        let r0 = rows.iter().find(|r| r.day == "2026-05-04").unwrap();
        let r1 = rows.iter().find(|r| r.day == "2026-05-05").unwrap();
        assert_eq!(r0.claude_work_seconds, 5 * 60);
        assert_eq!(r1.claude_work_seconds, 30 * 60);
    }

    #[test]
    fn empty_input_returns_empty() {
        let (rows, turns) = calculate_worklog(&[], None, "s");
        assert!(rows.is_empty());
        assert!(turns.is_empty());
    }

    #[test]
    fn assistant_before_any_real_user_is_ignored() {
        let msgs = vec![
            asst_msg("2026-05-04T10:00:00Z", "2026-05-04T10:00:05Z"),
            user_msg("2026-05-04T10:01:00Z", Some("hi"), false, false),
            asst_msg("2026-05-04T10:01:01Z", "2026-05-04T10:02:00Z"),
        ];
        let (rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 60);
    }

    #[test]
    fn sidechain_and_meta_skipped() {
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("real"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:30Z"),
            user_msg("2026-05-04T10:01:00Z", Some("sidechain msg"), true, false),
            user_msg("2026-05-04T10:02:00Z", Some("/clear"), false, true),
            asst_msg("2026-05-04T10:03:00Z", "2026-05-04T10:04:00Z"),
        ];
        let (rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 4 * 60);
    }

    #[test]
    fn assistant_end_uses_latest_timestamp_when_distinct_from_start() {
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("hi"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:50Z"),
        ];
        let (rows, _) = calculate_worklog(&msgs, None, "s");
        assert_eq!(rows[0].claude_work_seconds, 50);
    }
}
