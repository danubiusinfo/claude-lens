import { useEffect, useState, useCallback } from 'react';
import type { WorklogSummary } from '../types';
import { getSessionWorklog } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useSessionWorklog(sessionId: string | null) {
  const [data, setData] = useState<WorklogSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getSessionWorklog(sessionId);
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDbUpdate = useCallback(() => {
    refresh();
  }, [refresh]);

  useTauriEvent('db-updated', handleDbUpdate);

  return { data, loading, error };
}
