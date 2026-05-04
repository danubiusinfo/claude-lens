import { useEffect, useState, useCallback } from 'react';
import type { WorklogSummary } from '../types';
import { listSessionWorklogs } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useSessionWorklogs(sessionIds: string[]) {
  const [data, setData] = useState<Record<string, WorklogSummary>>({});
  const [loading, setLoading] = useState(false);

  const idsKey = sessionIds.join(',');

  const refresh = useCallback(async () => {
    if (sessionIds.length === 0) {
      setData({});
      return;
    }
    setLoading(true);
    try {
      const result = await listSessionWorklogs(sessionIds);
      setData(result);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDbUpdate = useCallback(() => {
    refresh();
  }, [refresh]);

  useTauriEvent('db-updated', handleDbUpdate);

  return { data, loading };
}
