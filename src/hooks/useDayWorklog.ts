import { useEffect, useState, useCallback } from 'react';
import type { DayWorklogProject } from '../types';
import { getDayWorklogByProject } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useDayWorklog(day: string | null) {
  const [data, setData] = useState<DayWorklogProject[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!day) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await getDayWorklogByProject(day);
      setData(rows);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDbUpdate = useCallback(() => {
    refresh();
  }, [refresh]);

  useTauriEvent('db-updated', handleDbUpdate);

  return { data, loading };
}
