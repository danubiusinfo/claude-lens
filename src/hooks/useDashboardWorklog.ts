import { useEffect, useState, useCallback } from 'react';
import type { WorklogSummary, TimeRange } from '../types';
import { getDashboardWorklog } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useDashboardWorklog(range: TimeRange) {
  const [data, setData] = useState<WorklogSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDashboardWorklog(range);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDbUpdate = useCallback(() => {
    refresh();
  }, [refresh]);

  useTauriEvent('db-updated', handleDbUpdate);

  return { data, loading };
}
