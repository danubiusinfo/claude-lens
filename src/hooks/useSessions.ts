import { useState, useEffect, useCallback, useRef } from 'react';
import type { SessionRecord } from '../types';
import { listSessions, getSessionDetail, listBookmarkedSessions, searchSessions, listDistinctProjects } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

interface SessionsData {
  sessions: SessionRecord[];
  loading: boolean;
  error: string | null;
  selectedSession: SessionRecord | null;
  selectedId: string | null;
  selectSession: (id: string) => void;
  clearSelection: () => void;
  loadMore: () => void;
  hasMore: boolean;
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
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
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

  const fetchSessions = useCallback(async (off: number, append: boolean, project?: string | null) => {
    setError(null);
    try {
      const result = await listSessions(PAGE_SIZE, off, project);
      if (append) {
        setSessions((prev) => [...prev, ...result]);
      } else {
        setSessions(result);
      }
      setHasMore(result.length >= PAGE_SIZE);
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
      setHasMore(false);
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
      setHasMore(false);
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
    setOffset(0);

    if (searchQuery.trim()) {
      searchTimer.current = setTimeout(() => {
        fetchSearch(searchQuery.trim());
      }, SEARCH_DEBOUNCE_MS);
    } else if (showBookmarked) {
      fetchBookmarked();
    } else {
      fetchSessions(0, false, selectedProject);
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

  const loadMore = useCallback(() => {
    if (searchQuery.trim() || showBookmarked) return;
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchSessions(newOffset, true, selectedProject);
  }, [offset, fetchSessions, searchQuery, showBookmarked, selectedProject]);

  const refreshLoadedWindow = useCallback(async () => {
    setError(null);
    try {
      const limit = offset + PAGE_SIZE;
      const result = await listSessions(limit, 0, selectedProject);
      setSessions(result);
      setHasMore(result.length >= limit);
    } catch (err) {
      console.error('Failed to refresh sessions window:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [offset, selectedProject]);

  const handleDbUpdate = useCallback(() => {
    // do NOT reset offset — we want to keep the user's current scroll position
    listDistinctProjects().then(setProjects).catch(console.error);
    if (searchQuery.trim()) {
      fetchSearch(searchQuery.trim());
    } else if (showBookmarked) {
      fetchBookmarked();
    } else {
      refreshLoadedWindow();
    }
    if (selectedId) {
      getSessionDetail(selectedId).then(setSelectedSession).catch(console.error);
    }
  }, [refreshLoadedWindow, fetchBookmarked, fetchSearch, showBookmarked, searchQuery, selectedId]);

  useTauriEvent('db-updated', handleDbUpdate);

  return {
    sessions,
    loading,
    error,
    selectedSession,
    selectedId,
    selectSession,
    clearSelection,
    loadMore,
    hasMore,
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
