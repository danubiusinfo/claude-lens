import { useState, useEffect, useCallback, useRef } from 'react';
import type { SessionRecord } from '../types';
import { listSessions, getSessionDetail, listBookmarkedSessions, searchSessions, listDistinctProjects } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

const SEARCH_DEBOUNCE_MS = 300;

interface SessionsData {
  sessions: SessionRecord[];
  loading: boolean;
  error: string | null;
  selectedSession: SessionRecord | null;
  selectedId: string | null;
  selectSession: (id: string) => void;
  clearSelection: () => void;
  showBookmarked: boolean;
  setShowBookmarked: (v: boolean) => void;
  updateSessionBookmark: (sessionId: string, bookmarked: boolean) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  updateSessionName: (sessionId: string, name: string | null) => void;
  projects: string[];
  selectedProject: string | null;
  setSelectedProject: (p: string | null) => void;
}

export function useSessions(): SessionsData {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBookmarked, setShowBookmarked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch distinct projects list
  useEffect(() => {
    listDistinctProjects().then(setProjects).catch(console.error);
  }, []);

  const fetchSessions = useCallback(async (project?: string | null) => {
    setError(null);
    try {
      const result = await listSessions(100_000, 0, project);
      setSessions(result);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBookmarked = useCallback(async () => {
    setError(null);
    try {
      const result = await listBookmarkedSessions();
      setSessions(result);
    } catch (err) {
      console.error('Failed to fetch bookmarked sessions:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSearch = useCallback(async (query: string) => {
    setError(null);
    try {
      const result = await searchSessions(query);
      setSessions(result);
    } catch (err) {
      console.error('Failed to search sessions:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);

    setLoading(true);

    if (searchQuery.trim()) {
      searchTimer.current = setTimeout(() => {
        fetchSearch(searchQuery.trim());
      }, SEARCH_DEBOUNCE_MS);
    } else if (showBookmarked) {
      fetchBookmarked();
    } else {
      fetchSessions(selectedProject);
    }

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, showBookmarked, selectedProject, fetchSessions, fetchBookmarked, fetchSearch]);

  const updateSessionBookmark = useCallback((sessionId: string, bookmarked: boolean) => {
    setSessions((prev) =>
      showBookmarked && !searchQuery.trim()
        ? prev.filter((s) => s.id !== sessionId || bookmarked)
        : prev.map((s) => (s.id === sessionId ? { ...s, bookmarked } : s))
    );
    setSelectedSession((prev) =>
      prev && prev.id === sessionId ? { ...prev, bookmarked } : prev
    );
  }, [showBookmarked, searchQuery]);

  const updateSessionName = useCallback((sessionId: string, name: string | null) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, custom_name: name } : s))
    );
    setSelectedSession((prev) =>
      prev && prev.id === sessionId ? { ...prev, custom_name: name } : prev
    );
  }, []);

  const selectSession = useCallback(async (id: string) => {
    setSelectedId(id);
    try {
      const detail = await getSessionDetail(id);
      setSelectedSession(detail);
    } catch (err) {
      console.error('Failed to fetch session detail:', err);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedSession(null);
  }, []);

  const refreshSessions = useCallback(async () => {
    setError(null);
    try {
      const result = await listSessions(100_000, 0, selectedProject);
      setSessions(result);
    } catch (err) {
      console.error('Failed to refresh sessions:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  const handleDbUpdate = useCallback(() => {
    listDistinctProjects().then(setProjects).catch(console.error);
    if (searchQuery.trim()) {
      fetchSearch(searchQuery.trim());
    } else if (showBookmarked) {
      fetchBookmarked();
    } else {
      refreshSessions();
    }
    if (selectedId) {
      getSessionDetail(selectedId).then(setSelectedSession).catch(console.error);
    }
  }, [refreshSessions, fetchBookmarked, fetchSearch, showBookmarked, searchQuery, selectedId]);

  useTauriEvent('db-updated', handleDbUpdate);

  return {
    sessions,
    loading,
    error,
    selectedSession,
    selectedId,
    selectSession,
    clearSelection,
    showBookmarked,
    setShowBookmarked,
    updateSessionBookmark,
    searchQuery,
    setSearchQuery,
    updateSessionName,
    projects,
    selectedProject,
    setSelectedProject,
  };
}
