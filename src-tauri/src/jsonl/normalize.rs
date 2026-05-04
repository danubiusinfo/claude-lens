use std::collections::HashMap;

use super::types::{ContentBlock, EnrichedSession, MessageMetadata, NormalizedSession, ParsedHistoryEntry, RawSessionEntry, SessionMessage};
use crate::models::ModelPricing;
use crate::pricing::estimate_cost;

/// Extract all text content from session entries for full-text search indexing.
pub fn extract_search_content(entries: &[RawSessionEntry]) -> String {
    let mut parts: Vec<String> = Vec::new();

    for entry in entries {
        match entry {
            RawSessionEntry::User(u) => {
                if u.is_meta.unwrap_or(false) {
                    continue;
                }
                if let Some(ref msg) = u.message {
                    if let Some(ref content) = msg.content {
                        if let Some(s) = content.as_str() {
                            parts.push(s.to_string());
                        } else if let Some(arr) = content.as_array() {
                            for item in arr {
                                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    if let Some(t) = item.get("text").and_then(|t| t.as_str()) {
                                        parts.push(t.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
            RawSessionEntry::Assistant(a) => {
                if let Some(ref msg) = a.message {
                    if let Some(ref content) = msg.content {
                        if let Some(arr) = content.as_array() {
                            for item in arr {
                                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    if let Some(t) = item.get("text").and_then(|t| t.as_str()) {
                                        parts.push(t.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    // Cap at ~50KB to avoid storing huge text blobs
    let joined = parts.join("\n");
    if joined.len() > 50_000 {
        joined[..50_000].to_string()
    } else {
        joined
    }
}

/// Group parsed entries by session_id and produce NormalizedSessions.
pub fn normalize_sessions(entries: &[ParsedHistoryEntry]) -> Vec<NormalizedSession> {
    let mut groups: HashMap<&str, Vec<&ParsedHistoryEntry>> = HashMap::new();

    for entry in entries {
        groups.entry(&entry.session_id).or_default().push(entry);
    }

    let mut sessions: Vec<NormalizedSession> = groups
        .into_iter()
        .map(|(session_id, mut entries)| {
            entries.sort_by_key(|e| e.timestamp_ms);

            let first = entries.first().unwrap();
            let last = entries.last().unwrap();

            // Use the first non-empty display text as the session's display
            let display_text = entries
                .iter()
                .find_map(|e| e.display_text.clone());

            // Use the most common project path
            let project_path = entries
                .iter()
                .find_map(|e| e.project_path.clone());

            NormalizedSession {
                session_id: session_id.to_string(),
                first_seen_at: first.timestamp_rfc3339.clone(),
                last_seen_at: last.timestamp_rfc3339.clone(),
                project_path,
                display_text,
                event_count: entries.len() as i64,
            }
        })
        .collect();

    sessions.sort_by(|a, b| b.last_seen_at.cmp(&a.last_seen_at));
    sessions
}

/// Normalize a per-session JSONL file's entries into an EnrichedSession with full token/cost data.
/// Returns None if no meaningful data is found.
pub fn normalize_session_file(
    entries: &[RawSessionEntry],
    fallback_session_id: &str,
    pricing: &[ModelPricing],
) -> Option<EnrichedSession> {
    // Collect assistant and user entries
    struct AssistantData {
        timestamp: Option<String>,
        request_id: Option<String>,
        model: Option<String>,
        input_tokens: i64,
        output_tokens: i64,
        cache_creation_tokens: i64,
        cache_read_tokens: i64,
        tool_use_count: i64,
        session_id: Option<String>,
        cwd: Option<String>,
    }

    struct UserData {
        timestamp: Option<String>,
        content_text: Option<String>,
        is_meta: bool,
        session_id: Option<String>,
        cwd: Option<String>,
    }

    let mut assistants: Vec<AssistantData> = Vec::new();
    let mut users: Vec<UserData> = Vec::new();
    let mut all_timestamps: Vec<String> = Vec::new();

    for entry in entries {
        match entry {
            RawSessionEntry::Assistant(a) => {
                if let Some(ts) = &a.timestamp {
                    all_timestamps.push(ts.clone());
                }

                let (input, output, cache_create, cache_read) =
                    if let Some(ref msg) = a.message {
                        if let Some(ref usage) = msg.usage {
                            (
                                usage.input_tokens.unwrap_or(0),
                                usage.output_tokens.unwrap_or(0),
                                usage.cache_creation_input_tokens.unwrap_or(0),
                                usage.cache_read_input_tokens.unwrap_or(0),
                            )
                        } else {
                            (0, 0, 0, 0)
                        }
                    } else {
                        (0, 0, 0, 0)
                    };

                // Count tool_use blocks in content
                let tool_use_count = a
                    .message
                    .as_ref()
                    .and_then(|m| m.content.as_ref())
                    .and_then(|c| c.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter(|item| item.get("type").and_then(|t| t.as_str()) == Some("tool_use"))
                            .count() as i64
                    })
                    .unwrap_or(0);

                let model = a.message.as_ref().and_then(|m| m.model.clone());

                assistants.push(AssistantData {
                    timestamp: a.timestamp.clone(),
                    request_id: a.request_id.clone(),
                    model,
                    input_tokens: input,
                    output_tokens: output,
                    cache_creation_tokens: cache_create,
                    cache_read_tokens: cache_read,
                    tool_use_count,
                    session_id: a.session_id.clone(),
                    cwd: a.cwd.clone(),
                });
            }
            RawSessionEntry::User(u) => {
                if let Some(ts) = &u.timestamp {
                    all_timestamps.push(ts.clone());
                }

                let content_text = u.message.as_ref().and_then(|m| {
                    m.content.as_ref().and_then(|c| {
                        // content can be a string or an array of content blocks
                        if let Some(s) = c.as_str() {
                            Some(s.to_string())
                        } else if let Some(arr) = c.as_array() {
                            arr.iter().find_map(|item| {
                                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    item.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                                } else {
                                    None
                                }
                            })
                        } else {
                            None
                        }
                    })
                });

                users.push(UserData {
                    timestamp: u.timestamp.clone(),
                    content_text,
                    is_meta: u.is_meta.unwrap_or(false),
                    session_id: u.session_id.clone(),
                    cwd: u.cwd.clone(),
                });
            }
            _ => {} // Skip progress, file-history-snapshot, unknown
        }
    }

    if assistants.is_empty() && users.is_empty() {
        return None;
    }

    // Deduplicate assistant entries by requestId — keep the one with highest output_tokens
    let mut deduped_assistants: Vec<&AssistantData> = Vec::new();
    let mut seen_request_ids: HashMap<&str, usize> = HashMap::new();

    for a in &assistants {
        if let Some(ref rid) = a.request_id {
            if let Some(&idx) = seen_request_ids.get(rid.as_str()) {
                // Keep the one with higher output_tokens (more complete)
                if a.output_tokens > deduped_assistants[idx].output_tokens {
                    deduped_assistants[idx] = a;
                }
            } else {
                seen_request_ids.insert(rid, deduped_assistants.len());
                deduped_assistants.push(a);
            }
        } else {
            // No requestId — include as unique
            deduped_assistants.push(a);
        }
    }

    // Aggregate tokens from deduplicated assistant entries
    let mut total_input: i64 = 0;
    let mut total_output: i64 = 0;
    let mut total_cached: i64 = 0;
    let mut total_tool_uses: i64 = 0;
    let mut total_cost: f64 = 0.0;
    let mut latest_model: Option<String> = None;
    let mut latest_model_ts: Option<&str> = None;

    for a in &deduped_assistants {
        total_input += a.input_tokens;
        total_output += a.output_tokens;
        total_cached += a.cache_creation_tokens + a.cache_read_tokens;
        total_tool_uses += a.tool_use_count;

        // Calculate cost per entry
        let model_ref = a.model.as_deref();
        total_cost += estimate_cost(model_ref, "input", a.input_tokens as f64, pricing);
        total_cost += estimate_cost(model_ref, "output", a.output_tokens as f64, pricing);
        total_cost += estimate_cost(model_ref, "cache_read", a.cache_read_tokens as f64, pricing);
        total_cost += estimate_cost(model_ref, "cache_write", a.cache_creation_tokens as f64, pricing);

        // Track latest model by timestamp
        if let Some(ref model) = a.model {
            let ts = a.timestamp.as_deref();
            if latest_model_ts.is_none() || ts > latest_model_ts {
                latest_model = Some(model.clone());
                latest_model_ts = ts;
            }
        }
    }

    let total_tokens = total_input + total_output + total_cached;

    // Session ID: prefer from entries, fallback to filename
    let session_id = assistants
        .iter()
        .find_map(|a| a.session_id.clone())
        .or_else(|| users.iter().find_map(|u| u.session_id.clone()))
        .unwrap_or_else(|| fallback_session_id.to_string());

    // Display text: first non-meta, non-command user entry content
    let display_text = users
        .iter()
        .filter(|u| !u.is_meta)
        .filter(|u| {
            u.content_text
                .as_ref()
                .map(|t| {
                    let trimmed = t.trim();
                    !trimmed.is_empty()
                        && !trimmed.starts_with("<command-name>")
                        && !trimmed.starts_with("<local-command-")
                })
                .unwrap_or(false)
        })
        .find_map(|u| u.content_text.clone())
        .map(|text| {
            let first_line = text.lines().next().unwrap_or(&text);
            if first_line.chars().count() > 200 {
                let truncated: String = first_line.chars().take(197).collect();
                format!("{}...", truncated)
            } else {
                first_line.to_string()
            }
        });

    // Project path: first cwd found
    let project_path = users
        .iter()
        .find_map(|u| u.cwd.clone())
        .or_else(|| assistants.iter().find_map(|a| a.cwd.clone()));

    // Timestamps: min/max from all entries
    all_timestamps.sort();
    let first_seen_at = all_timestamps.first()?.clone();
    let last_seen_at = all_timestamps.last()?.clone();

    // Event count: non-meta user messages
    let event_count = users.iter().filter(|u| !u.is_meta).count() as i64;

    Some(EnrichedSession {
        session_id,
        first_seen_at,
        last_seen_at,
        project_path,
        display_text,
        event_count,
        tool_event_count: total_tool_uses,
        model_summary: latest_model,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_cached_input_tokens: total_cached,
        total_reasoning_tokens: 0,
        total_tokens,
        total_cost_usd: total_cost,
    })
}

/// Extract content blocks from a JSON content array.
fn extract_content_blocks(content: &serde_json::Value) -> Vec<ContentBlock> {
    let mut blocks = Vec::new();
    if let Some(arr) = content.as_array() {
        for item in arr {
            match item.get("type").and_then(|t| t.as_str()) {
                Some("thinking") => {
                    if let Some(thinking) = item.get("thinking").and_then(|t| t.as_str()) {
                        if !thinking.is_empty() {
                            blocks.push(ContentBlock::Thinking {
                                thinking: thinking.to_string(),
                            });
                        }
                    }
                }
                Some("text") => {
                    if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                        blocks.push(ContentBlock::Text {
                            text: text.to_string(),
                        });
                    }
                }
                Some("tool_use") => {
                    blocks.push(ContentBlock::ToolUse {
                        tool_id: item
                            .get("id")
                            .and_then(|i| i.as_str())
                            .unwrap_or("")
                            .to_string(),
                        tool_name: item
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown")
                            .to_string(),
                        input: item.get("input").cloned().unwrap_or(serde_json::Value::Null),
                    });
                }
                _ => {}
            }
        }
    }
    blocks
}

/// Extract individual messages from per-session JSONL entries with per-message cost.
/// Merges assistant entries by requestId, collecting all content blocks.
/// Returns messages in chronological order.
pub fn extract_session_messages(entries: &[RawSessionEntry], pricing: &[ModelPricing]) -> Vec<SessionMessage> {
    struct PendingAssistantTurn {
        timestamp: Option<String>,
        model: Option<String>,
        content_blocks: Vec<ContentBlock>,
        input_tokens: i64,
        output_tokens: i64,
        cache_creation_tokens: i64,
        cache_read_tokens: i64,
        cwd: Option<String>,
        git_branch: Option<String>,
        version: Option<String>,
        is_sidechain: bool,
    }

    let mut messages: Vec<(Option<String>, SessionMessage)> = Vec::new();

    // Collect assistant turns, merging by requestId
    // Use Vec to preserve insertion order, HashMap for lookup
    let mut assistant_turns: Vec<(Option<String>, PendingAssistantTurn)> = Vec::new(); // (requestId, turn)
    let mut request_id_index: HashMap<String, usize> = HashMap::new();

    for entry in entries {
        match entry {
            RawSessionEntry::User(u) => {
                let content_text = u.message.as_ref().and_then(|m| {
                    m.content.as_ref().and_then(|c| {
                        if let Some(s) = c.as_str() {
                            Some(s.to_string())
                        } else if let Some(arr) = c.as_array() {
                            arr.iter().find_map(|item| {
                                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    item.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                                } else {
                                    None
                                }
                            })
                        } else {
                            None
                        }
                    })
                });

                let content_blocks = if let Some(ref text) = content_text {
                    vec![ContentBlock::Text { text: text.clone() }]
                } else {
                    vec![]
                };

                let is_meta = u.is_meta.unwrap_or(false);

                messages.push((u.timestamp.clone(), SessionMessage {
                    role: "user".to_string(),
                    timestamp: u.timestamp.clone(),
                    content_text,
                    content_blocks,
                    metadata: Some(MessageMetadata {
                        cwd: u.cwd.clone(),
                        git_branch: u.git_branch.clone(),
                        version: u.version.clone(),
                        is_sidechain: u.is_sidechain.unwrap_or(false),
                    }),
                    model: None,
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_creation_tokens: 0,
                    cache_read_tokens: 0,
                    cost_usd: 0.0,
                    tool_use_count: 0,
                    is_meta,
                }));
            }
            RawSessionEntry::Assistant(a) => {
                let blocks = a
                    .message
                    .as_ref()
                    .and_then(|m| m.content.as_ref())
                    .map(|c| extract_content_blocks(c))
                    .unwrap_or_default();

                let (input, output, cache_create, cache_read) =
                    if let Some(ref msg) = a.message {
                        if let Some(ref usage) = msg.usage {
                            (
                                usage.input_tokens.unwrap_or(0),
                                usage.output_tokens.unwrap_or(0),
                                usage.cache_creation_input_tokens.unwrap_or(0),
                                usage.cache_read_input_tokens.unwrap_or(0),
                            )
                        } else {
                            (0, 0, 0, 0)
                        }
                    } else {
                        (0, 0, 0, 0)
                    };

                let model = a.message.as_ref().and_then(|m| m.model.clone());

                if let Some(ref rid) = a.request_id {
                    if let Some(&idx) = request_id_index.get(rid.as_str()) {
                        // Merge into existing turn
                        let turn = &mut assistant_turns[idx].1;
                        turn.content_blocks.extend(blocks);
                        turn.input_tokens = turn.input_tokens.max(input);
                        turn.output_tokens = turn.output_tokens.max(output);
                        turn.cache_creation_tokens = turn.cache_creation_tokens.max(cache_create);
                        turn.cache_read_tokens = turn.cache_read_tokens.max(cache_read);
                        if turn.model.is_none() {
                            turn.model = model;
                        }
                        if turn.timestamp.is_none() || a.timestamp < turn.timestamp {
                            turn.timestamp = a.timestamp.clone();
                        }
                        continue;
                    }
                }

                // New turn
                let idx = assistant_turns.len();
                if let Some(ref rid) = a.request_id {
                    request_id_index.insert(rid.clone(), idx);
                }
                assistant_turns.push((a.request_id.clone(), PendingAssistantTurn {
                    timestamp: a.timestamp.clone(),
                    model,
                    content_blocks: blocks,
                    input_tokens: input,
                    output_tokens: output,
                    cache_creation_tokens: cache_create,
                    cache_read_tokens: cache_read,
                    cwd: a.cwd.clone(),
                    git_branch: a.git_branch.clone(),
                    version: a.version.clone(),
                    is_sidechain: a.is_sidechain.unwrap_or(false),
                }));
            }
            _ => {}
        }
    }

    // Convert assistant turns to SessionMessages
    for (_rid, turn) in assistant_turns {
        let model_ref = turn.model.as_deref();
        let cost = estimate_cost(model_ref, "input", turn.input_tokens as f64, pricing)
            + estimate_cost(model_ref, "output", turn.output_tokens as f64, pricing)
            + estimate_cost(model_ref, "cache_read", turn.cache_read_tokens as f64, pricing)
            + estimate_cost(model_ref, "cache_write", turn.cache_creation_tokens as f64, pricing);

        let tool_use_count = turn
            .content_blocks
            .iter()
            .filter(|b| matches!(b, ContentBlock::ToolUse { .. }))
            .count() as i64;

        // content_text = concatenation of all Text blocks for backward compat
        let text_parts: Vec<&str> = turn
            .content_blocks
            .iter()
            .filter_map(|b| match b {
                ContentBlock::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect();
        let content_text = if text_parts.is_empty() {
            None
        } else {
            Some(text_parts.join("\n"))
        };

        messages.push((turn.timestamp.clone(), SessionMessage {
            role: "assistant".to_string(),
            timestamp: turn.timestamp,
            content_text,
            content_blocks: turn.content_blocks,
            metadata: Some(MessageMetadata {
                cwd: turn.cwd,
                git_branch: turn.git_branch,
                version: turn.version,
                is_sidechain: turn.is_sidechain,
            }),
            model: turn.model,
            input_tokens: turn.input_tokens,
            output_tokens: turn.output_tokens,
            cache_creation_tokens: turn.cache_creation_tokens,
            cache_read_tokens: turn.cache_read_tokens,
            cost_usd: cost,
            tool_use_count,
            is_meta: false,
        }));
    }

    // Sort by timestamp
    messages.sort_by(|a, b| a.0.cmp(&b.0));
    messages.into_iter().map(|(_, msg)| msg).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jsonl::parser::parse_session_line;

    #[test]
    fn test_normalize_session_file_basic() {
        let lines = vec![
            r#"{"type":"user","message":{"role":"user","content":"hello world"},"timestamp":"2026-03-13T06:00:00.000Z","sessionId":"s1","cwd":"/project","isMeta":false}"#,
            r#"{"type":"assistant","message":{"model":"claude-opus-4-6","content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":100,"output_tokens":50}},"requestId":"req1","timestamp":"2026-03-13T06:00:01.000Z","sessionId":"s1","cwd":"/project"}"#,
        ];

        let entries: Vec<RawSessionEntry> = lines
            .iter()
            .filter_map(|l| parse_session_line(l))
            .collect();

        let enriched = normalize_session_file(&entries, "fallback", &[]).unwrap();
        assert_eq!(enriched.session_id, "s1");
        assert_eq!(enriched.total_input_tokens, 100);
        assert_eq!(enriched.total_output_tokens, 50);
        assert_eq!(enriched.display_text, Some("hello world".to_string()));
        assert_eq!(enriched.model_summary, Some("claude-opus-4-6".to_string()));
        assert!(enriched.total_cost_usd > 0.0);
    }

    #[test]
    fn test_normalize_dedup_request_id() {
        // Two assistant entries with same requestId — should keep one with higher output_tokens
        let lines = vec![
            r#"{"type":"assistant","message":{"model":"claude-opus-4-6","content":[{"type":"thinking","thinking":"..."}],"usage":{"input_tokens":100,"output_tokens":5}},"requestId":"req1","timestamp":"2026-03-13T06:00:01.000Z","sessionId":"s1"}"#,
            r#"{"type":"assistant","message":{"model":"claude-opus-4-6","content":[{"type":"text","text":"done"}],"usage":{"input_tokens":100,"output_tokens":50}},"requestId":"req1","timestamp":"2026-03-13T06:00:02.000Z","sessionId":"s1"}"#,
        ];

        let entries: Vec<RawSessionEntry> = lines
            .iter()
            .filter_map(|l| parse_session_line(l))
            .collect();

        let enriched = normalize_session_file(&entries, "fallback", &[]).unwrap();
        // Should count tokens only once (from the entry with output_tokens=50)
        assert_eq!(enriched.total_input_tokens, 100);
        assert_eq!(enriched.total_output_tokens, 50);
    }

    #[test]
    fn test_normalize_tool_use_count() {
        let lines = vec![
            r#"{"type":"assistant","message":{"model":"claude-sonnet-4-6","content":[{"type":"tool_use","id":"t1","name":"Read","input":{}},{"type":"tool_use","id":"t2","name":"Write","input":{}}],"usage":{"input_tokens":10,"output_tokens":20}},"requestId":"req1","timestamp":"2026-03-13T06:00:01.000Z","sessionId":"s1"}"#,
        ];

        let entries: Vec<RawSessionEntry> = lines
            .iter()
            .filter_map(|l| parse_session_line(l))
            .collect();

        let enriched = normalize_session_file(&entries, "fallback", &[]).unwrap();
        assert_eq!(enriched.tool_event_count, 2);
    }

    #[test]
    fn test_normalize_skips_meta_user() {
        let lines = vec![
            r#"{"type":"user","message":{"role":"user","content":"meta command"},"timestamp":"2026-03-13T06:00:00.000Z","sessionId":"s1","isMeta":true}"#,
            r#"{"type":"user","message":{"role":"user","content":"real question"},"timestamp":"2026-03-13T06:00:01.000Z","sessionId":"s1","isMeta":false}"#,
        ];

        let entries: Vec<RawSessionEntry> = lines
            .iter()
            .filter_map(|l| parse_session_line(l))
            .collect();

        let enriched = normalize_session_file(&entries, "fallback", &[]).unwrap();
        assert_eq!(enriched.display_text, Some("real question".to_string()));
        assert_eq!(enriched.event_count, 1); // only non-meta
    }

    #[test]
    fn test_extract_messages_merges_request_id() {
        // Two assistant entries with same requestId should merge into one message with all content blocks
        let lines = vec![
            r#"{"type":"assistant","message":{"model":"claude-opus-4-6","content":[{"type":"thinking","thinking":"let me think"}],"usage":{"input_tokens":100,"output_tokens":5}},"requestId":"req1","timestamp":"2026-03-13T06:00:01.000Z","sessionId":"s1","cwd":"/project","gitBranch":"main","version":"2.1.74"}"#,
            r#"{"type":"assistant","message":{"model":"claude-opus-4-6","content":[{"type":"text","text":"hello"}],"usage":{"input_tokens":100,"output_tokens":50}},"requestId":"req1","timestamp":"2026-03-13T06:00:02.000Z","sessionId":"s1","cwd":"/project"}"#,
        ];

        let entries: Vec<RawSessionEntry> = lines
            .iter()
            .filter_map(|l| parse_session_line(l))
            .collect();

        let msgs = extract_session_messages(&entries, &[]);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "assistant");
        assert_eq!(msgs[0].content_blocks.len(), 2);
        assert!(matches!(&msgs[0].content_blocks[0], ContentBlock::Thinking { thinking } if thinking == "let me think"));
        assert!(matches!(&msgs[0].content_blocks[1], ContentBlock::Text { text } if text == "hello"));
        assert_eq!(msgs[0].content_text, Some("hello".to_string()));
        // Token counts: max across entries
        assert_eq!(msgs[0].input_tokens, 100);
        assert_eq!(msgs[0].output_tokens, 50);
        // Metadata from first entry
        let meta = msgs[0].metadata.as_ref().unwrap();
        assert_eq!(meta.cwd, Some("/project".to_string()));
        assert_eq!(meta.git_branch, Some("main".to_string()));
        assert_eq!(meta.version, Some("2.1.74".to_string()));
    }

    #[test]
    fn test_extract_messages_tool_use_blocks() {
        let lines = vec![
            r#"{"type":"assistant","message":{"model":"claude-sonnet-4-6","content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/foo.rs"}}],"usage":{"input_tokens":10,"output_tokens":20}},"requestId":"req1","timestamp":"2026-03-13T06:00:01.000Z","sessionId":"s1"}"#,
        ];

        let entries: Vec<RawSessionEntry> = lines
            .iter()
            .filter_map(|l| parse_session_line(l))
            .collect();

        let msgs = extract_session_messages(&entries, &[]);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].tool_use_count, 1);
        assert!(matches!(&msgs[0].content_blocks[0], ContentBlock::ToolUse { tool_name, .. } if tool_name == "Read"));
    }

    #[test]
    fn test_extract_messages_user_metadata() {
        let lines = vec![
            r#"{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-03-13T06:00:00.000Z","sessionId":"s1","cwd":"/myproject","gitBranch":"feature","version":"2.1.74","isSidechain":true,"isMeta":false}"#,
        ];

        let entries: Vec<RawSessionEntry> = lines
            .iter()
            .filter_map(|l| parse_session_line(l))
            .collect();

        let msgs = extract_session_messages(&entries, &[]);
        assert_eq!(msgs.len(), 1);
        let meta = msgs[0].metadata.as_ref().unwrap();
        assert_eq!(meta.cwd, Some("/myproject".to_string()));
        assert_eq!(meta.git_branch, Some("feature".to_string()));
        assert_eq!(meta.version, Some("2.1.74".to_string()));
        assert!(meta.is_sidechain);
    }
}
