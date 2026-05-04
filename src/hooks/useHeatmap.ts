import { useState, useEffect, useCallback } from 'react';
import type { DailyUsageRecord, TimeRange } from '../types';
import { getDailyHeatmap } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

interface HeatmapData {
  days: DailyUsageRecord[];
  loading: boolean;
  error: string | null;
}

export function useHeatmap(range: TimeRange): HeatmapData {
  const [days, setDays] = useState<DailyUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const result = await getDailyHeatmap(range);
      setDays(result);
    } catch (err) {
      console.error('Failed to fetch heatmap data:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  const handleDbUpdate = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  useTauriEvent('db-updated', handleDbUpdate);

  return { days, loading, error };
}
