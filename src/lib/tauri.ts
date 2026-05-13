import { invoke } from '@tauri-apps/api/core';
import type {
  AppStatusResponse,
  DailyUsageRecord,
  DashboardContextSummary,
  DashboardSummary,
  DayWorklogProject,
  ImportResult,
  ModelPricing,
  PlanEntry,
  ProjectStats,
  SessionContextStats,
  SessionMessage,
  SessionRecord,
  SourceStatusInfo,
  TimeRange,
  TimeseriesPoint,
  TurnWorklog,
  UserProfile,
  WorklogSummary,
} from '../types';

export async function getUserProfile(): Promise<UserProfile> {
  return invoke('get_user_profile');
}

export async function getAppStatus(): Promise<AppStatusResponse> {
  return invoke('get_app_status');
}

export async function clearLocalData(): Promise<void> {
  return invoke('clear_local_data');
}

// ── Dashboard Commands ──────────────────────────────────────

export async function getDashboardSummary(
  range: TimeRange
): Promise<DashboardSummary> {
  return invoke('get_dashboard_summary', { range });
}

export async function getTokenTimeseries(
  range: TimeRange
): Promise<TimeseriesPoint[]> {
  return invoke('get_token_timeseries', { range });
}

export async function getInputOutputBreakdown(
  range: TimeRange
): Promise<TimeseriesPoint[]> {
  return invoke('get_input_output_breakdown', { range });
}

export async function getDailyHeatmap(
  range: TimeRange
): Promise<DailyUsageRecord[]> {
  return invoke('get_daily_heatmap', { range });
}

export async function getProjectStats(
  limit?: number
): Promise<ProjectStats[]> {
  return invoke('get_project_stats', { limit });
}

export async function listSessions(
  limit?: number,
  offset?: number,
  project?: string | null
): Promise<SessionRecord[]> {
  return invoke('list_sessions', { limit, offset, project });
}

export async function listDistinctProjects(): Promise<string[]> {
  return invoke('list_distinct_projects');
}

export async function getSessionDetail(
  sessionId: string
): Promise<SessionRecord | null> {
  return invoke('get_session_detail', { sessionId });
}

export async function getSessionMessages(
  sourceSessionId: string
): Promise<SessionMessage[]> {
  return invoke('get_session_messages', { sourceSessionId });
}

export async function toggleSessionBookmark(
  sessionId: string
): Promise<boolean> {
  return invoke('toggle_session_bookmark', { sessionId });
}

export async function listBookmarkedSessions(): Promise<SessionRecord[]> {
  return invoke('list_bookmarked_sessions');
}

export async function renameSession(
  sessionId: string,
  customName: string | null
): Promise<void> {
  return invoke('rename_session', { sessionId, customName });
}

export async function searchSessions(
  query: string,
  limit?: number
): Promise<SessionRecord[]> {
  return invoke('search_sessions', { query, limit });
}

// ── Plan Commands ──────────────────────────────────────────

export async function listPlans(): Promise<PlanEntry[]> {
  return invoke('list_plans');
}

export async function readPlan(filename: string): Promise<string> {
  return invoke('read_plan', { filename });
}

export async function revealPlanInFinder(filename: string): Promise<void> {
  return invoke('reveal_plan_in_finder', { filename });
}

// ── JSONL Commands ──────────────────────────────────────────

export async function runJsonlImport(
  full?: boolean
): Promise<ImportResult> {
  return invoke('run_jsonl_import', { full });
}

export async function getSourceStatus(): Promise<SourceStatusInfo> {
  return invoke('get_source_status');
}

// ── Pricing Commands ──────────────────────────────────────────

export async function getModelPricing(): Promise<ModelPricing[]> {
  return invoke('get_model_pricing');
}

export async function updateModelPricing(
  modelKey: string,
  inputPerMillion: number,
  outputPerMillion: number,
  cacheReadPerMillion: number,
  cacheWritePerMillion: number,
  contextLimit: number,
): Promise<void> {
  return invoke('update_model_pricing', {
    modelKey,
    inputPerMillion,
    outputPerMillion,
    cacheReadPerMillion,
    cacheWritePerMillion,
    contextLimit,
  });
}

export async function resetModelPricing(): Promise<ModelPricing[]> {
  return invoke('reset_model_pricing');
}

// ── Worklog Commands ──────────────────────────────────────────

export async function getSessionWorklog(sessionId: string): Promise<WorklogSummary> {
  return invoke<WorklogSummary>('get_session_worklog', { sessionId });
}

export async function getSessionWorklogTurns(sessionId: string): Promise<TurnWorklog[]> {
  return invoke<TurnWorklog[]>('get_session_worklog_turns', { sessionId });
}

export async function getDashboardWorklog(range: TimeRange): Promise<WorklogSummary> {
  return invoke<WorklogSummary>('get_dashboard_worklog', { range });
}

export async function getDayWorklogByProject(day: string): Promise<DayWorklogProject[]> {
  return invoke<DayWorklogProject[]>('get_day_worklog_by_project', { day });
}

export async function listSessionWorklogs(
  sessionIds: string[],
): Promise<Record<string, WorklogSummary>> {
  return invoke<Record<string, WorklogSummary>>('list_session_worklogs', { sessionIds });
}

export async function recomputeWorklogs(): Promise<void> {
  await invoke<void>('recompute_worklogs');
}

// ── Context Monitor Commands ──────────────────────────────────

export async function getSessionContextStats(
  sourceSessionId: string
): Promise<SessionContextStats> {
  return invoke<SessionContextStats>('get_session_context_stats', { sourceSessionId });
}

export async function getDashboardContextSummary(
  range: TimeRange
): Promise<DashboardContextSummary> {
  return invoke<DashboardContextSummary>('get_dashboard_context_summary', { range });
}

