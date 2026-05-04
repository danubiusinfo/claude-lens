import { useState, useEffect, useCallback } from 'react';
import type {
  DashboardSummary,
  TimeseriesPoint,
  TimeRange,
} from '../types';
import {
  getDashboardSummary,
  getTokenTimeseries,
  getInputOutputBreakdown,
} from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

interface DashboardData {
  summary: DashboardSummary | null;
  tokenTimeseries: TimeseriesPoint[];
  inputOutputBreakdown: TimeseriesPoint[];
  loading: boolean;
  error: string | null;
}

export function useDashboard(range: TimeRange): DashboardData {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tokenTimeseries, setTokenTimeseries] = useState<TimeseriesPoint[]>([]);
  const [inputOutputBreakdown, setInputOutputBreakdown] = useState<
    TimeseriesPoint[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [s, tt, io] = await Promise.all([
        getDashboardSummary(range),
        getTokenTimeseries(range),
        getInputOutputBreakdown(range),
      ]);
      setSummary(s);
      setTokenTimeseries(tt);
      setInputOutputBreakdown(io);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  // Refresh on new telemetry
  const handleDbUpdate = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  useTauriEvent('db-updated', handleDbUpdate);

  return { summary, tokenTimeseries, inputOutputBreakdown, loading, error };
}
