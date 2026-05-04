import { useEffect, useState, useCallback } from 'react';
import type { TurnWorklog } from '../types';
import { getSessionWorklogTurns } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useSessionWorklogTurns(sessionId: string | null) {
  const [data, setData] = useState<TurnWorklog[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await getSessionWorklogTurns(sessionId);
      setData(rows);
    } catch {
      setData([]);
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

  return { data, loading };
}
