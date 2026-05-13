import { useState, useEffect, useCallback } from 'react';
import type { DashboardContextSummary, TimeRange } from '../types';
import { getDashboardContextSummary } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

interface DashboardContextData {
  summary: DashboardContextSummary | null;
  loading: boolean;
  error: string | null;
}

export function useDashboardContext(range: TimeRange): DashboardContextData {
  const [summary, setSummary] = useState<DashboardContextSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const data = await getDashboardContextSummary(range);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { setLoading(true); fetch(); }, [fetch]);

  const handleDbUpdate = useCallback(() => { fetch(); }, [fetch]);
  useTauriEvent('db-updated', handleDbUpdate);

  return { summary, loading, error };
}
