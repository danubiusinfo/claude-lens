use super::types::{ParsedHistoryEntry, RawHistoryEntry, RawSessionEntry};

/// Parse a single line from a JSONL history file.
/// Returns None on malformed input rather than failing.
pub fn parse_history_line(line: &str) -> Option<ParsedHistoryEntry> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    let raw: RawHistoryEntry = serde_json::from_str(line).ok()?;

    // Convert ms timestamp to RFC3339
    let secs = (raw.timestamp / 1000) as i64;
    let nanos = ((raw.timestamp % 1000) * 1_000_000) as u32;
    let dt = chrono::DateTime::from_timestamp(secs, nanos)?;
    let timestamp_rfc3339 = dt.to_rfc3339();

    // Clean up display text — take first line, cap length
    let display_text = raw.display.and_then(|d| {
        let trimmed = d.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            let first_line = trimmed.lines().next().unwrap_or(&trimmed);
            Some(if first_line.chars().count() > 200 {
                let truncated: String = first_line.chars().take(197).collect();
                format!("{}...", truncated)
            } else {
                first_line.to_string()
            })
        }
    });

    Some(ParsedHistoryEntry {
        session_id: raw.session_id,
        timestamp_ms: raw.timestamp,
        timestamp_rfc3339,
        project_path: raw.project,
        display_text,
    })
}

/// Parse a single line from a per-session JSONL file.
/// Returns None on malformed input rather than failing.
pub fn parse_session_line(line: &str) -> Option<RawSessionEntry> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    serde_json::from_str::<RawSessionEntry>(line).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_history_line() {
        let line = r#"{"display":"hello world","pastedContents":{},"timestamp":1771499987938,"project":"/Users/test/project","sessionId":"abc-123"}"#;
        let parsed = parse_history_line(line).unwrap();
        assert_eq!(parsed.session_id, "abc-123");
        assert_eq!(parsed.display_text, Some("hello world".to_string()));
        assert_eq!(parsed.project_path, Some("/Users/test/project".to_string()));
        assert!(parsed.timestamp_rfc3339.contains("2026"));
    }

    #[test]
    fn test_parse_empty_line() {
        assert!(parse_history_line("").is_none());
        assert!(parse_history_line("  ").is_none());
    }

    #[test]
    fn test_parse_malformed() {
        assert!(parse_history_line("{bad json").is_none());
        assert!(parse_history_line("null").is_none());
    }

    #[test]
    fn test_parse_session_line_assistant() {
        let line = r#"{"parentUuid":"abc","isSidechain":false,"type":"assistant","message":{"model":"claude-opus-4-6","id":"msg_01","type":"message","role":"assistant","content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":200,"cache_read_input_tokens":300}},"requestId":"req_01","uuid":"uuid1","timestamp":"2026-03-13T06:01:27.271Z","sessionId":"sess-1","version":"2.1.74","cwd":"/test"}"#;
        let entry = parse_session_line(line).unwrap();
        match entry {
            RawSessionEntry::Assistant(a) => {
                assert_eq!(a.session_id, Some("sess-1".to_string()));
                assert_eq!(a.request_id, Some("req_01".to_string()));
                let msg = a.message.unwrap();
                assert_eq!(msg.model, Some("claude-opus-4-6".to_string()));
                let usage = msg.usage.unwrap();
                assert_eq!(usage.input_tokens, Some(100));
                assert_eq!(usage.output_tokens, Some(50));
                assert_eq!(usage.cache_read_input_tokens, Some(300));
            }
            _ => panic!("Expected Assistant entry"),
        }
    }

    #[test]
    fn test_parse_session_line_user() {
        let line = r#"{"parentUuid":"abc","isSidechain":false,"type":"user","message":{"role":"user","content":"hello world"},"uuid":"uuid2","timestamp":"2026-03-13T06:00:00.000Z","sessionId":"sess-1","cwd":"/test","isMeta":false}"#;
        let entry = parse_session_line(line).unwrap();
        match entry {
            RawSessionEntry::User(u) => {
                assert_eq!(u.session_id, Some("sess-1".to_string()));
                assert_eq!(u.is_meta, Some(false));
                let msg = u.message.unwrap();
                assert_eq!(msg.content.unwrap().as_str().unwrap(), "hello world");
            }
            _ => panic!("Expected User entry"),
        }
    }

    #[test]
    fn test_parse_session_line_progress() {
        let line = r#"{"type":"progress","data":{"type":"agent_progress"},"parentUuid":"abc"}"#;
        let entry = parse_session_line(line).unwrap();
        assert!(matches!(entry, RawSessionEntry::Progress(_)));
    }

    #[test]
    fn test_parse_session_line_empty() {
        assert!(parse_session_line("").is_none());
        assert!(parse_session_line("  ").is_none());
    }
}
